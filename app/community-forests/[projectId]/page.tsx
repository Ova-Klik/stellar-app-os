/**
 * Community forest detail page (Issue #1646).
 *
 * Renders the collective impact dashboard of a single community forest
 * project: the shared impact totals, the group leaderboard, the milestone
 * celebrations and the actions a sponsor can take (join, contribute a tree).
 */

import type { Metadata } from 'next';

import { CommunityForestDashboard } from '@/components/organisms/CommunityForestDashboard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Community Forest',
  description:
    'Shared impact dashboard, group leaderboard and milestone celebrations of a community forest project.',
};

interface CommunityForestProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function CommunityForestProjectPage({
  params,
}: CommunityForestProjectPageProps) {
  const { projectId } = await params;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <CommunityForestDashboard projectId={projectId} />
      </div>
    </div>
  );
}
