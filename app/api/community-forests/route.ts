/**
 * Community forest projects (Issue #1646).
 *
 * GET  /api/community-forests — lists the community forest projects with
 *                               their collective impact.
 * POST /api/community-forests — creates a community forest project. Only
 *                               platform admins and certified partner
 *                               organisations may do this.
 *
 * 200 { projects: CommunityForestSummary[], total }
 * 201 { project: CommunityForestProject }
 * 400 { error }
 * 403 { error }
 */

import { type NextRequest, NextResponse } from 'next/server';

import { resolveCommunityForestCreator } from '@/lib/community-forest/permissions';
import {
  createCommunityForestProject,
  listCommunityForestSummaries,
} from '@/lib/community-forest/service';
import {
  CommunityForestError,
  parseCreateCommunityForestInput,
} from '@/lib/community-forest/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const projects = await listCommunityForestSummaries();

    return NextResponse.json(
      { projects, total: projects.length },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[api/community-forests] list failed:', error);
    return NextResponse.json({ error: 'Unable to load community forests' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let input;
  try {
    input = parseCreateCommunityForestInput(body);
  } catch (error) {
    const status = error instanceof CommunityForestError ? error.status : 400;
    const message = error instanceof Error ? error.message : 'Invalid community forest payload';
    return NextResponse.json({ error: message }, { status });
  }

  try {
    const creator = await resolveCommunityForestCreator(input);
    const project = await createCommunityForestProject(input, creator);

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    if (error instanceof CommunityForestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[api/community-forests] create failed:', error);
    return NextResponse.json(
      { error: 'Unable to create community forest project' },
      { status: 500 }
    );
  }
}
