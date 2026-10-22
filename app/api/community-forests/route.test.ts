import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { query, isAdminRequest } = vi.hoisted(() => ({
  query: vi.fn(),
  isAdminRequest: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({ getPool: () => ({ query }) }));
vi.mock('@/lib/auth/admin', () => ({ isAdminRequest }));

import { GET, POST } from './route';
import {
  resetPartnerCertificationsForTest,
  reviewApplication,
  submitApplication,
} from '@/lib/partner-certification';

const OWNER_WALLET = `G${'A'.repeat(55)}`;
const PARTNER_ID = 'partner-acme';
const PARTNER_EMAIL = 'contact@acme.org';

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

const SUMMARY_ROW = {
  ...PROJECT_ROW,
  total_trees: 12,
  planted_trees: 10,
  co2_kg_per_year: 220,
  sponsor_count: 3,
};

function mockPool(): void {
  const handler = (sql: string, params?: unknown[]) => {
    if (sql.includes('INSERT INTO community_forest_projects')) {
      const [name, description, baseProjectId, createdByKind, createdById] = params as string[];
      return {
        rows: [
          {
            ...PROJECT_ROW,
            name,
            description,
            base_project_id: baseProjectId,
            created_by_kind: createdByKind,
            created_by_id: createdById,
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes('INSERT INTO community_forest_members')) {
      return {
        rows: [
          {
            sponsor_wallet: OWNER_WALLET,
            display_name: null,
            role: 'creator',
            joined_at: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes('AS total_trees')) {
      return { rows: [SUMMARY_ROW], rowCount: 1 };
    }
    if (sql.includes('SELECT project_id, threshold_trees')) {
      return {
        rows: [
          {
            project_id: 1,
            threshold_trees: 100,
            title: '100 trees planted',
            trees_at_celebration: 120,
            celebrated_at: new Date('2026-02-01T00:00:00.000Z'),
          },
        ],
        rowCount: 1,
      };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  };

  query.mockImplementation((sql: string, params?: unknown[]) =>
    Promise.resolve(handler(sql, params))
  );
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/community-forests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function certifyApprovedPartner(): void {
  const application = submitApplication({
    partnerId: PARTNER_ID,
    organisationName: 'Acme Reforestation',
    contactEmail: PARTNER_EMAIL,
    nativeTrees: 100,
    totalTrees: 100,
    monitoringVisitsPerYear: 4,
    reportedSurvivalRate: 95,
    reportsPerYear: 4,
    evidenceUrl: 'https://example.com/evidence',
    attested: true,
  });
  reviewApplication(application.id, 'approve', null);
}

describe('POST /api/community-forests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPartnerCertificationsForTest();
    isAdminRequest.mockResolvedValue(false);
    mockPool();
  });

  it('creates a project for a platform admin', async () => {
    isAdminRequest.mockResolvedValue(true);

    const response = await POST(postRequest({ name: 'Northern Grove', baseProjectId: 'proj-001' }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.project).toMatchObject({
      id: '1',
      name: 'Northern Grove',
      baseProjectId: 'proj-001',
      createdByKind: 'admin',
    });
  });

  it('adds the owner wallet as the first member of the project', async () => {
    isAdminRequest.mockResolvedValue(true);

    const response = await POST(
      postRequest({
        name: 'Northern Grove',
        baseProjectId: 'proj-001',
        ownerWallet: OWNER_WALLET,
      })
    );

    expect(response.status).toBe(201);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO community_forest_members'),
      ['1', OWNER_WALLET, null, 'creator']
    );
  });

  it('creates a project for a certified partner organisation', async () => {
    certifyApprovedPartner();

    const response = await POST(
      postRequest({
        name: 'Northern Grove',
        baseProjectId: 'proj-001',
        organisationId: PARTNER_ID,
        organisationContactEmail: PARTNER_EMAIL,
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.project).toMatchObject({
      createdByKind: 'organisation',
      createdById: PARTNER_ID,
    });
  });

  it('rejects an organisation that cannot prove it owns the certification', async () => {
    certifyApprovedPartner();

    const response = await POST(
      postRequest({
        name: 'Northern Grove',
        baseProjectId: 'proj-001',
        organisationId: PARTNER_ID,
        organisationContactEmail: 'attacker@evil.org',
      })
    );

    expect(response.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a request that is neither an admin nor a certified organisation', async () => {
    const response = await POST(postRequest({ name: 'Northern Grove', baseProjectId: 'proj-001' }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/Only platform admins or certified partner organisations/);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid payload', async () => {
    const response = await POST(postRequest({ baseProjectId: 'proj-001' }));

    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown base project', async () => {
    const response = await POST(
      postRequest({ name: 'Northern Grove', baseProjectId: 'proj-does-not-exist' })
    );

    expect(response.status).toBe(400);
  });

  it('returns 400 for a malformed JSON body', async () => {
    const response = await POST(postRequest('{not json'));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Invalid JSON body');
  });
});

describe('GET /api/community-forests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool();
  });

  it('lists the community forests with their collective impact', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.projects[0]).toMatchObject({
      id: '1',
      name: 'Northern Grove',
      plantedTrees: 10,
      totalTrees: 12,
      sponsorCount: 3,
      co2KgPerYear: 220,
    });
    expect(body.projects[0].baseProject).toMatchObject({ id: 'proj-001' });
    expect(body.projects[0].milestones.celebrated).toHaveLength(1);
    expect(body.projects[0].milestones.next).toMatchObject({ thresholdTrees: 500 });
  });

  it('returns 500 when the database fails', async () => {
    query.mockRejectedValueOnce(new Error('connection terminated'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(500);
  });
});
