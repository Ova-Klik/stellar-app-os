/**
 * Who may create a community forest project (Issue #1646).
 *
 * The platform has two creators for a community forest:
 *
 * 1. **Platform admin** — proven by the admin role cookie the admin routes
 *    already use (`lib/auth/admin.ts`).
 * 2. **Certified partner organisation** — an organisation that holds an
 *    approved, unexpired tree planting certification
 *    (`lib/partner-certification.ts`). The organisation has to prove it owns
 *    the certification by sending the contact email the certification was
 *    issued for, so the claim is validated on the server and never taken from
 *    the client.
 *
 * Everything in this module runs on the server only.
 */

import { isAdminRequest } from '@/lib/auth/admin';
import { getActiveCertification } from '@/lib/partner-certification';

import type { CommunityForestCreatorKind } from './types';
import { CommunityForestError, type CreateCommunityForestInput } from './validation';

/** Identifier stored for projects created by the platform admin team. */
export const PLATFORM_ADMIN_CREATOR_ID = 'platform-admin';

export interface CommunityForestCreator {
  kind: CommunityForestCreatorKind;
  id: string;
}

/**
 * Resolves the creator of a community forest project from the request.
 *
 * Throws a `CommunityForestError` with status 403 when the caller is neither
 * an admin nor a certified organisation.
 */
export async function resolveCommunityForestCreator(
  input: CreateCommunityForestInput
): Promise<CommunityForestCreator> {
  const isAdmin = await isAdminRequest();
  const organisationId = input.organisationId?.trim();

  if (organisationId) {
    const certification = getActiveCertification(organisationId);
    if (!certification) {
      throw new CommunityForestError('Organisation is not a certified partner organisation', 403);
    }

    const claimedEmail = input.organisationContactEmail?.trim().toLowerCase();
    if (!claimedEmail || claimedEmail !== certification.contactEmail.trim().toLowerCase()) {
      throw new CommunityForestError(
        'organisationContactEmail does not match the certified organisation',
        403
      );
    }

    return { kind: 'organisation', id: organisationId };
  }

  if (isAdmin) {
    return { kind: 'admin', id: PLATFORM_ADMIN_CREATOR_ID };
  }

  throw new CommunityForestError(
    'Only platform admins or certified partner organisations can create a community forest project',
    403
  );
}
