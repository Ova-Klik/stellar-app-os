/**
 * Community forest directory (Issue #1646).
 *
 * Lists the named projects several sponsors pool their sponsorship into and
 * lets platform admins and certified partner organisations create new ones.
 *
 * The admin flag is resolved on the server from the admin role cookie — the
 * client never decides who is allowed to create a project, the API re-checks
 * every claim on its own.
 */

import type { Metadata } from 'next';

import { CommunityForestDirectory } from '@/components/organisms/CommunityForestDirectory';
import { isAdminRequest } from '@/lib/auth/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Community Forests',
  description:
    'Pool your sponsorship with other sponsors into a named community forest project and share the impact.',
};

export default async function CommunityForestsPage() {
  const isAdmin = await isAdminRequest();

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-6">
          <h1 className="text-3xl font-black tracking-tight text-foreground">Community forests</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            A community forest is a named project several sponsors contribute to together. Every
            contribution joins the shared impact dashboard, the group leaderboard and the milestone
            celebrations of the project.
          </p>
        </header>

        <CommunityForestDirectory isAdmin={isAdmin} />
      </div>
    </div>
  );
}
