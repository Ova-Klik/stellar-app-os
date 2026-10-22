import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query }) }));

import { POST } from './route';

const SPONSOR_WALLET = `G${'B'.repeat(55)}`;

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

const MEMBER_ROW = {
  sponsor_wallet: SPONSOR_WALLET,
  display_name: null,
  role: 'sponsor',
  joined_at: new Date('2026-01-02T00:00:00.000Z'),
};

function mockPool(options: { projectExists?: boolean; memberInserted?: boolean } = {}): void {
  const { projectExists = true, memberInserted = true } = options;

  const handler = (sql: string) => {
    if (sql.includes('INSERT INTO community_forest_members')) {
      return memberInserted ? { rows: [MEMBER_ROW], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (sql.includes('FROM community_forest_projects')) {
      return projectExists ? { rows: [PROJECT_ROW], rowCount: 1 } : { rows: [], rowCount: 0 };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  };

  query.mockImplementation((sql: string) => Promise.resolve(handler(sql)));
}

function joinRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/community-forests/1/members', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function callJoin(body: unknown) {
  return POST(joinRequest(body), { params: Promise.resolve({ projectId: '1' }) });
}

describe('POST /api/community-forests/[projectId]/members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool();
  });

  it('adds a sponsor to the project', async () => {
    const response = await callJoin({ sponsorWallet: SPONSOR_WALLET });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.member).toMatchObject({
      sponsorWallet: SPONSOR_WALLET,
      role: 'sponsor',
    });
  });

  it('returns 409 when the sponsor already takes part in the project', async () => {
    mockPool({ memberInserted: false });

    const response = await callJoin({ sponsorWallet: SPONSOR_WALLET });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/already a member/);
  });

  it('returns 404 when the project does not exist', async () => {
    mockPool({ projectExists: false });

    const response = await callJoin({ sponsorWallet: SPONSOR_WALLET });

    expect(response.status).toBe(404);
  });

  it('returns 400 for an invalid sponsor wallet', async () => {
    const response = await callJoin({ sponsorWallet: 'not-a-wallet' });

    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 400 when the sponsor wallet is missing', async () => {
    const response = await callJoin({});

    expect(response.status).toBe(400);
  });

  it('returns 400 for a malformed JSON body', async () => {
    const response = await callJoin('{not json');

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Invalid JSON body');
  });
});
