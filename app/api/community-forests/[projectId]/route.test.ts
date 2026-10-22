import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query }) }));

import { GET } from './route';

const SPONSOR_WALLET = `G${'D'.repeat(55)}`;

const PROJECT_ROW = {
  id: 1,
  name: 'Northern Grove',
  description: 'A shared grove',
  base_project_id: 'proj-001',
  created_by_kind: 'organisation',
  created_by_id: 'partner-acme',
  status: 'active',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
};

const IMPACT_ROW = {
  total_trees: 12,
  planted_trees: 10,
  funded_trees: 2,
  co2_kg_per_year: 220,
  sponsor_count: 2,
};

const MEMBER_ROWS = [
  {
    sponsor_wallet: SPONSOR_WALLET,
    display_name: 'Ada',
    role: 'sponsor',
    joined_at: new Date('2026-01-02T00:00:00.000Z'),
  },
  {
    sponsor_wallet: `G${'E'.repeat(55)}`,
    display_name: null,
    role: 'sponsor',
    joined_at: new Date('2026-01-03T00:00:00.000Z'),
  },
];

const CONTRIBUTION_ROWS = [
  {
    sponsor_wallet: SPONSOR_WALLET,
    display_name: 'Ada',
    trees_contributed: 8,
    trees_planted: 6,
    co2_kg_per_year: 132,
  },
  {
    sponsor_wallet: `G${'E'.repeat(55)}`,
    display_name: null,
    trees_contributed: 4,
    trees_planted: 4,
    co2_kg_per_year: 88,
  },
];

function mockPool(options: { projectExists?: boolean } = {}): void {
  const { projectExists = true } = options;

  const handler = (sql: string) => {
    if (sql.includes('AS total_trees')) {
      return { rows: [IMPACT_ROW], rowCount: 1 };
    }
    if (sql.includes('ORDER BY joined_at ASC')) {
      return { rows: MEMBER_ROWS, rowCount: MEMBER_ROWS.length };
    }
    if (sql.includes('trees_contributed')) {
      return { rows: CONTRIBUTION_ROWS, rowCount: CONTRIBUTION_ROWS.length };
    }
    if (sql.includes('FROM community_forest_milestones')) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('FROM community_forest_projects')) {
      return projectExists ? { rows: [PROJECT_ROW], rowCount: 1 } : { rows: [], rowCount: 0 };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  };

  query.mockImplementation((sql: string) => Promise.resolve(handler(sql)));
}

function dashboardRequest(queryString = ''): NextRequest {
  return new NextRequest(`http://localhost/api/community-forests/1${queryString}`);
}

function callDashboard(queryString = '') {
  return GET(dashboardRequest(queryString), { params: Promise.resolve({ projectId: '1' }) });
}

describe('GET /api/community-forests/[projectId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool();
  });

  it('returns the collective impact dashboard of the project', async () => {
    const response = await callDashboard();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.project).toMatchObject({
      id: '1',
      name: 'Northern Grove',
      baseProjectId: 'proj-001',
      createdByKind: 'organisation',
    });
    expect(body.baseProject).toMatchObject({ id: 'proj-001' });
    expect(body.impact).toEqual({
      totalTrees: 12,
      plantedTrees: 10,
      fundedTrees: 2,
      co2KgPerYear: 220,
      sponsorCount: 2,
    });
    expect(body.members).toHaveLength(2);
    expect(body.leaderboard.metric).toBe('trees_planted');
    expect(body.leaderboard.entries[0]).toMatchObject({
      rank: 1,
      sponsorWallet: SPONSOR_WALLET,
      treesPlanted: 6,
      treesContributed: 8,
    });
    expect(body.milestones.next).toMatchObject({ thresholdTrees: 100 });
  });

  it('tells a participating viewer that it is already a member', async () => {
    const response = await callDashboard(`?wallet=${SPONSOR_WALLET}`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.viewer).toEqual({ sponsorWallet: SPONSOR_WALLET, isMember: true });
  });

  it('tells a visitor that it is not a member yet', async () => {
    const response = await callDashboard();
    const body = await response.json();

    expect(body.viewer).toEqual({ sponsorWallet: null, isMember: false });
  });

  it('returns 404 for an unknown project', async () => {
    mockPool({ projectExists: false });

    const response = await callDashboard();

    expect(response.status).toBe(404);
    expect((await response.json()).error).toMatch(/not found/);
  });

  it('returns 500 when the database fails', async () => {
    query.mockRejectedValueOnce(new Error('connection terminated'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await callDashboard();

    expect(response.status).toBe(500);
  });
});
