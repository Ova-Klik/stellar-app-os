/**
 * GET /api/community-forests/:projectId — Issue #1646
 *
 * The collective impact dashboard of a community forest project: the project
 * itself, the participating sponsors, the aggregate impact, the group
 * leaderboard and the milestone progress.
 *
 * Query parameters:
 *   wallet — optional sponsor wallet, used to tell the viewer whether it is
 *            already taking part in the project.
 *
 * 200 { project, baseProject, impact, members, leaderboard, milestones, viewer }
 * 404 { error }
 */

import { type NextRequest, NextResponse } from 'next/server';

import { getCommunityForestDashboard } from '@/lib/community-forest/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { projectId } = await context.params;
  const viewerWallet = request.nextUrl.searchParams.get('wallet')?.trim() || undefined;

  try {
    const dashboard = await getCommunityForestDashboard(projectId, viewerWallet);

    if (!dashboard) {
      return NextResponse.json({ error: 'Community forest project not found' }, { status: 404 });
    }

    return NextResponse.json(dashboard, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[api/community-forests/:projectId] load failed:', error);
    return NextResponse.json({ error: 'Unable to load community forest project' }, { status: 500 });
  }
}
