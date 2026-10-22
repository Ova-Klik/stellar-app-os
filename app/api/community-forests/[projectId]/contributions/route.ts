/**
 * POST /api/community-forests/:projectId/contributions — Issue #1646
 *
 * Attributes a tree a sponsor funded to the community forest project and
 * celebrates every milestone the project reached with it.
 *
 * Only sponsors taking part in the project may contribute, a tree can only be
 * counted once, and a milestone is only ever celebrated once.
 *
 * 200 { contributed, plantedTrees, celebrated }
 * 400 { error }
 * 403 { error }
 * 404 { error }
 * 409 { error }
 */

import { type NextRequest, NextResponse } from 'next/server';

import { contributeTreeToCommunityForest } from '@/lib/community-forest/service';
import {
  CommunityForestError,
  parseContributeCommunityForestInput,
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
    input = parseContributeCommunityForestInput(body);
  } catch (error) {
    const status = error instanceof CommunityForestError ? error.status : 400;
    const message = error instanceof Error ? error.message : 'Invalid contribution payload';
    return NextResponse.json({ error: message }, { status });
  }

  try {
    const result = await contributeTreeToCommunityForest(projectId, input);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof CommunityForestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[api/community-forests/:projectId/contributions] contribute failed:', error);
    return NextResponse.json({ error: 'Unable to contribute tree' }, { status: 500 });
  }
}
