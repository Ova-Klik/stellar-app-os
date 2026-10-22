import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isAdminRequest } = vi.hoisted(() => ({ isAdminRequest: vi.fn() }));

vi.mock('@/lib/auth/admin', () => ({ isAdminRequest }));

import {
  PLATFORM_ADMIN_CREATOR_ID,
  resolveCommunityForestCreator,
} from '@/lib/community-forest/permissions';
import {
  resetPartnerCertificationsForTest,
  reviewApplication,
  submitApplication,
  type CertificationApplicationInput,
} from '@/lib/partner-certification';

const PARTNER_ID = 'partner-acme';
const PARTNER_EMAIL = 'contact@acme.org';

function applicationInput(
  overrides: Partial<CertificationApplicationInput> = {}
): CertificationApplicationInput {
  return {
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
    ...overrides,
  };
}

function certifyApprovedPartner(partnerId = PARTNER_ID, contactEmail = PARTNER_EMAIL): void {
  const application = submitApplication(applicationInput({ partnerId, contactEmail }));
  reviewApplication(application.id, 'approve', null);
}

describe('resolveCommunityForestCreator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPartnerCertificationsForTest();
    isAdminRequest.mockResolvedValue(false);
  });

  it('lets a platform admin create a project without an organisation claim', async () => {
    isAdminRequest.mockResolvedValue(true);

    const creator = await resolveCommunityForestCreator({
      name: 'Northern Grove',
      baseProjectId: 'proj-001',
    });

    expect(creator).toEqual({ kind: 'admin', id: PLATFORM_ADMIN_CREATOR_ID });
  });

  it('rejects a request that is neither an admin nor a certified organisation', async () => {
    await expect(
      resolveCommunityForestCreator({ name: 'Northern Grove', baseProjectId: 'proj-001' })
    ).rejects.toMatchObject({ status: 403 });
  });

  it('lets a certified organisation create a project', async () => {
    certifyApprovedPartner();

    const creator = await resolveCommunityForestCreator({
      name: 'Northern Grove',
      baseProjectId: 'proj-001',
      organisationId: PARTNER_ID,
      organisationContactEmail: PARTNER_EMAIL,
    });

    expect(creator).toEqual({ kind: 'organisation', id: PARTNER_ID });
  });

  it('rejects an organisation that is not certified', async () => {
    await expect(
      resolveCommunityForestCreator({
        name: 'Northern Grove',
        baseProjectId: 'proj-001',
        organisationId: PARTNER_ID,
        organisationContactEmail: PARTNER_EMAIL,
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects an organisation that cannot prove it owns the certification', async () => {
    certifyApprovedPartner();

    await expect(
      resolveCommunityForestCreator({
        name: 'Northern Grove',
        baseProjectId: 'proj-001',
        organisationId: PARTNER_ID,
        organisationContactEmail: 'someone-else@acme.org',
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects an organisation claim without a contact email', async () => {
    certifyApprovedPartner();

    await expect(
      resolveCommunityForestCreator({
        name: 'Northern Grove',
        baseProjectId: 'proj-001',
        organisationId: PARTNER_ID,
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it('ignores the admin role when an organisation claim is made', async () => {
    isAdminRequest.mockResolvedValue(true);

    await expect(
      resolveCommunityForestCreator({
        name: 'Northern Grove',
        baseProjectId: 'proj-001',
        organisationId: 'unknown-partner',
        organisationContactEmail: PARTNER_EMAIL,
      })
    ).rejects.toMatchObject({ status: 403 });
  });
});
