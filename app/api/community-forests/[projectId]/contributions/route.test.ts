import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query }) }));

import { POST } from './route';

const SPONSOR_WALLET = `G${'C'.repeat(55)}`;
const TREE_REF = 'HRV-2024-0001';

const PROJECT_ROW = {
  id: 1,
  name: 'Northern Grove',
  description: 'A shared grove',
  base_project_id: 'proj-001',
  created_by_kind: 'admin',
  created_by_id: 'platform-admin',
  status: 'active',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
};

interface MockOptions {
  projectExists?: boolean;
  isMember?: boolean;
  treeClaim?: { id: number; community_forest_project_id: number | null } | null;
  plantedTrees?: number;
  celebratedThresholds?: number[];
}

function mockPool(options: MockOptions = {}): void {
  const {
    projectExists = true,
    isMember = true,
    treeClaim = { id: 42, community_forest_project_id: null },
    plantedTrees = 120,
    celebratedThresholds = [],
  } = options;

  const handler = (sql: string) => {
    if (sql.includes('INSERT INTO community_forest_milestones')) {
      // The store only inserts the thresholds that are still pending.
      const pending = [100, 500, 1000, 5000, 10000].filter(
        (threshold) => threshold <= plantedTrees && !celebratedThresholds.includes(threshold)
      );

      return {
        rows: pending.map((threshold) => ({
          threshold_trees: threshold,
          title: `${threshold} trees planted`,
          trees_at_celebration: plantedTrees,
          celebrated_at: new Date('2026-02-01T00:00:00.000Z'),
        })),
        rowCount: pending.length,
      };
    }
    if (sql.includes('WITH inserted AS')) {
      return {
        rows: [{ contributed: 1, planted_trees: plantedTrees }],
        rowCount: 1,
      };
    }
    if (sql.includes('FROM community_forest_milestones')) {
      return {
        rows: celebratedThresholds.map((threshold) => ({
          threshold_trees: threshold,
          title: `${threshold} trees planted`,
          trees_at_celebration: threshold,
          celebrated_at: new Date('2026-02-01T00:00:00.000Z'),
        })),
        rowCount: celebratedThresholds.length,
      };
    }
    if (sql.includes('LEFT JOIN community_forest_trees cft ON cft.tree_id = t.id')) {
      return treeClaim ? { rows: [treeClaim], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (sql.includes('SELECT 1 FROM community_forest_members')) {
      return { rows: isMember ? [{ '?column?': 1 }] : [], rowCount: isMember ? 1 : 0 };
    }
    if (sql.includes('FROM community_forest_projects')) {
      return projectExists ? { rows: [PROJECT_ROW], rowCount: 1 } : { rows: [], rowCount: 0 };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  };

  query.mockImplementation((sql: string) => Promise.resolve(handler(sql)));
}

function contributeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/community-forests/1/contributions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function callContribute(body: unknown) {
  return POST(contributeRequest(body), { params: Promise.resolve({ projectId: '1' }) });
}

describe('POST /api/community-forests/[projectId]/contributions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool();
  });

  it('contributes a tree and celebrates the milestone it reached', async () => {
    const response = await callContribute({
      sponsorWallet: SPONSOR_WALLET,
      treeRef: TREE_REF,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.contributed).toBe(true);
    expect(body.plantedTrees).toBe(120);
    expect(body.celebrated).toHaveLength(1);
    expect(body.celebrated[0]).toMatchObject({
      thresholdTrees: 100,
      treesAtCelebration: 120,
    });
  });

  it('celebrates every threshold crossed at once', async () => {
    mockPool({ plantedTrees: 1200 });

    const response = await callContribute({
      sponsorWallet: SPONSOR_WALLET,
      treeRef: TREE_REF,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(
      body.celebrated.map((milestone: { thresholdTrees: number }) => milestone.thresholdTrees)
    ).toEqual([100, 500, 1000]);
  });

  it('does not celebrate a milestone twice', async () => {
    mockPool({ plantedTrees: 150, celebratedThresholds: [100] });

    const response = await callContribute({
      sponsorWallet: SPONSOR_WALLET,
      treeRef: TREE_REF,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.celebrated).toEqual([]);
    expect(
      query.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO community_forest_milestones')
      )
    ).toHaveLength(0);
  });

  it('refuses a sponsor that does not take part in the project', async () => {
    mockPool({ isMember: false });

    const response = await callContribute({
      sponsorWallet: SPONSOR_WALLET,
      treeRef: TREE_REF,
    });

    expect(response.status).toBe(403);
  });

  it('returns 409 when the tree already belongs to a community forest', async () => {
    mockPool({ treeClaim: { id: 42, community_forest_project_id: 7 } });

    const response = await callContribute({
      sponsorWallet: SPONSOR_WALLET,
      treeRef: TREE_REF,
    });

    expect(response.status).toBe(409);
  });

  it('returns 404 for an unknown tree', async () => {
    mockPool({ treeClaim: null });

    const response = await callContribute({
      sponsorWallet: SPONSOR_WALLET,
      treeRef: TREE_REF,
    });

    expect(response.status).toBe(404);
  });

  it('returns 404 for an unknown project', async () => {
    mockPool({ projectExists: false });

    const response = await callContribute({
      sponsorWallet: SPONSOR_WALLET,
      treeRef: TREE_REF,
    });

    expect(response.status).toBe(404);
  });

  it('returns 400 for an invalid sponsor wallet', async () => {
    const response = await callContribute({ sponsorWallet: 'nope', treeRef: TREE_REF });

    expect(response.status).toBe(400);
  });

  it('returns 400 when the tree reference is missing', async () => {
    const response = await callContribute({ sponsorWallet: SPONSOR_WALLET });

    expect(response.status).toBe(400);
  });
});
