/**
 * POST /api/community-forests/:projectId/members — Issue #1646
 *
 * Joins a sponsor to a community forest project. Membership is unique per
 * project, so a sponsor can only join once.
 *
 * 201 { member }
 * 400 { error }
 * 404 { error }
 * 409 { error } — the sponsor already takes part in the project
 */

import { type NextRequest, NextResponse } from 'next/server';

import { joinCommunityForestProject } from '@/lib/community-forest/service';
import {
  CommunityForestError,
  parseJoinCommunityForestInput,
} from '@/lib/community-forest/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { projectId } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let input;
  try {
    input = parseJoinCommunityForestInput(body);
  } catch (error) {
    const status = error instanceof CommunityForestError ? error.status : 400;
    const message = error instanceof Error ? error.message : 'Invalid sponsor payload';
    return NextResponse.json({ error: message }, { status });
  }

  try {
    const member = await joinCommunityForestProject(projectId, input);
    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    if (error instanceof CommunityForestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[api/community-forests/:projectId/members] join failed:', error);
    return NextResponse.json({ error: 'Unable to join community forest' }, { status: 500 });
  }
}
