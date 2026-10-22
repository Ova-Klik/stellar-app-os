/**
 * Community forest service layer (Issue #1646).
 *
 * Orchestrates the store, the pure ranking/milestone logic and the platform
 * catalogues into the operations the API routes and the UI need:
 *
 * - create a community forest project,
 * - join it as a sponsor,
 * - contribute a tree and celebrate the milestones that were reached,
 * - read the collective impact dashboard and the group leaderboard.
 */

import { getPool } from '@/lib/db/client';

import { rankCommunityForestSponsors } from './leaderboard';
import { buildMilestoneProgress, getUncelebratedMilestoneThresholds } from './milestones';
import type { CommunityForestCreator } from './permissions';
import { findBaseProject } from './project-catalogue';
import {
  insertCommunityForestMember,
  insertCommunityForestMilestoneCelebrations,
  insertCommunityForestProject,
  insertCommunityForestTree,
  isCommunityForestMember,
  selectCommunityForestContributions,
  selectCommunityForestImpact,
  selectCommunityForestMembers,
  selectCommunityForestMilestones,
  selectCommunityForestMilestonesForProjects,
  selectCommunityForestProject,
  selectCommunityForestProjectSummaries,
  selectCommunityForestTreeClaim,
} from './store';
import type {
  CommunityForestBaseProject,
  CommunityForestImpact,
  CommunityForestLeaderboardEntry,
  CommunityForestLeaderboardMetric,
  CommunityForestMember,
  CommunityForestMilestoneCelebration,
  CommunityForestMilestoneProgress,
  CommunityForestProject,
  CommunityForestSummary,
} from './types';
import {
  CommunityForestError,
  type ContributeCommunityForestInput,
  type CreateCommunityForestInput,
  type JoinCommunityForestInput,
} from './validation';

/** The collective impact dashboard of a community forest project. */
export interface CommunityForestDashboard {
  project: CommunityForestProject;
  baseProject: CommunityForestBaseProject | null;
  impact: CommunityForestImpact;
  members: CommunityForestMember[];
  leaderboard: {
    metric: CommunityForestLeaderboardMetric;
    entries: CommunityForestLeaderboardEntry[];
  };
  milestones: CommunityForestMilestoneProgress;
  viewer: {
    sponsorWallet: string | null;
    isMember: boolean;
  };
}

/** Lists every community forest project with its collective impact. */
export async function listCommunityForestSummaries(): Promise<CommunityForestSummary[]> {
  const pool = getPool();
  const [rows, celebratedByProject] = await Promise.all([
    selectCommunityForestProjectSummaries(pool),
    selectCommunityForestMilestonesForProjects(pool),
  ]);

  return rows.map((row) => {
    const project: CommunityForestProject = {
      id: String(row.id),
      name: row.name,
      description: row.description,
      baseProjectId: row.base_project_id,
      createdByKind: row.created_by_kind,
      createdById: row.created_by_id,
      status: row.status,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    };

    const plantedTrees = toNumber(row.planted_trees);

    return {
      ...project,
      baseProject: findBaseProject(project.baseProjectId),
      totalTrees: toNumber(row.total_trees),
      plantedTrees,
      co2KgPerYear: toNumber(row.co2_kg_per_year),
      sponsorCount: toNumber(row.sponsor_count),
      milestones: buildMilestoneProgress(plantedTrees, celebratedByProject.get(project.id) ?? []),
    };
  });
}

/** Reads the collective impact dashboard of a community forest project. */
export async function getCommunityForestDashboard(
  projectId: string,
  viewerWallet?: string
): Promise<CommunityForestDashboard | null> {
  const pool = getPool();
  const project = await selectCommunityForestProject(pool, projectId);
  if (!project) return null;

  const [impact, members, contributions, celebrated] = await Promise.all([
    selectCommunityForestImpact(pool, projectId),
    selectCommunityForestMembers(pool, projectId),
    selectCommunityForestContributions(pool, projectId),
    selectCommunityForestMilestones(pool, projectId),
  ]);

  const leaderboard = rankCommunityForestSponsors(contributions);

  return {
    project,
    baseProject: findBaseProject(project.baseProjectId),
    impact,
    members,
    leaderboard: {
      metric: 'trees_planted',
      entries: leaderboard,
    },
    milestones: buildMilestoneProgress(impact.plantedTrees, celebrated),
    viewer: {
      sponsorWallet: viewerWallet ?? null,
      isMember: viewerWallet
        ? members.some((member) => member.sponsorWallet === viewerWallet)
        : false,
    },
  };
}

/** Creates a community forest project for an admin or certified organisation. */
export async function createCommunityForestProject(
  input: CreateCommunityForestInput,
  creator: CommunityForestCreator
): Promise<CommunityForestProject> {
  const pool = getPool();

  const project = await insertCommunityForestProject(pool, {
    name: input.name,
    description: input.description ?? null,
    baseProjectId: input.baseProjectId,
    createdByKind: creator.kind,
    createdById: creator.id,
  });

  if (input.ownerWallet) {
    await insertCommunityForestMember(pool, {
      projectId: project.id,
      sponsorWallet: input.ownerWallet,
      displayName: null,
      role: 'creator',
    });
  }

  return project;
}

/** Adds a sponsor to a community forest project. */
export async function joinCommunityForestProject(
  projectId: string,
  input: JoinCommunityForestInput
): Promise<CommunityForestMember> {
  const pool = getPool();

  const project = await selectCommunityForestProject(pool, projectId);
  if (!project) {
    throw new CommunityForestError('Community forest project not found', 404);
  }

  const member = await insertCommunityForestMember(pool, {
    projectId,
    sponsorWallet: input.sponsorWallet,
    displayName: input.displayName ?? null,
    role: 'sponsor',
  });

  if (!member) {
    throw new CommunityForestError('Sponsor is already a member of this community forest', 409);
  }

  return member;
}

/** Result of contributing a tree to a community forest project. */
export interface ContributeTreeResult {
  contributed: boolean;
  plantedTrees: number;
  /** Milestones celebrated by this contribution. */
  celebrated: CommunityForestMilestoneCelebration[];
}

/**
 * Attributes a tree to a community forest and celebrates every milestone the
 * project reached with it.
 */
export async function contributeTreeToCommunityForest(
  projectId: string,
  input: ContributeCommunityForestInput
): Promise<ContributeTreeResult> {
  const pool = getPool();

  const project = await selectCommunityForestProject(pool, projectId);
  if (!project) {
    throw new CommunityForestError('Community forest project not found', 404);
  }

  const isMember = await isCommunityForestMember(pool, projectId, input.sponsorWallet);
  if (!isMember) {
    throw new CommunityForestError(
      'Only sponsors taking part in the project can contribute trees',
      403
    );
  }

  const claim = await selectCommunityForestTreeClaim(pool, input.treeRef);
  if (!claim) {
    throw new CommunityForestError('Tree not found', 404);
  }
  if (claim.communityForestProjectId) {
    throw new CommunityForestError(
      claim.communityForestProjectId === projectId
        ? 'Tree is already part of this community forest'
        : 'Tree is already attributed to another community forest',
      409
    );
  }

  const inserted = await insertCommunityForestTree(pool, {
    projectId,
    treeRef: input.treeRef,
    contributedBy: input.sponsorWallet,
  });

  if (!inserted.contributed) {
    throw new CommunityForestError('Tree is already part of a community forest', 409);
  }

  const celebrated = await selectCommunityForestMilestones(pool, projectId);
  const pending = getUncelebratedMilestoneThresholds(
    inserted.plantedTrees,
    celebrated.map((milestone) => milestone.thresholdTrees)
  );

  const newlyCelebrated = await insertCommunityForestMilestoneCelebrations(pool, {
    projectId,
    plantedTrees: inserted.plantedTrees,
    thresholds: pending,
  });

  return {
    contributed: true,
    plantedTrees: inserted.plantedTrees,
    celebrated: newlyCelebrated,
  };
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}
