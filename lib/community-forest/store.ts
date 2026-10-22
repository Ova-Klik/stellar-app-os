/**
 * Postgres data access for community forest projects (Issue #1646).
 *
 * The store is the only place that talks to the database. Every function
 * takes the pool as an argument — like `lib/team-forest.ts` — so the routes
 * stay thin and the queries stay testable.
 *
 * Guarantees that matter for this feature:
 * - A sponsor can only be a member of a project once
 *   (`PRIMARY KEY (project_id, sponsor_wallet)`).
 * - A tree can only be counted for one community forest
 *   (`UNIQUE (tree_id)`), so collective impact is never double counted.
 * - A milestone can only be celebrated once per project
 *   (`UNIQUE (project_id, threshold_trees)`), and the insert uses
 *   `ON CONFLICT DO NOTHING ... RETURNING`, so concurrent contributions can
 *   never celebrate the same milestone twice.
 */

import type { Pool } from 'pg';

import type { CommunityForestSponsorContribution } from './leaderboard';
import { PLANTED_TREE_STATUSES } from './milestones';
import type {
  CommunityForestCreatorKind,
  CommunityForestImpact,
  CommunityForestMember,
  CommunityForestMemberRole,
  CommunityForestMilestoneCelebration,
  CommunityForestProject,
  CommunityForestStatus,
} from './types';

export type CommunityForestPool = Pick<Pool, 'query'>;

interface CommunityForestProjectRow {
  id: number | string;
  name: string;
  description: string | null;
  base_project_id: string;
  created_by_kind: CommunityForestCreatorKind;
  created_by_id: string;
  status: CommunityForestStatus;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CommunityForestMemberRow {
  sponsor_wallet: string;
  display_name: string | null;
  role: CommunityForestMemberRole;
  joined_at: Date | string;
}

interface CommunityForestImpactRow {
  total_trees: number | string;
  planted_trees: number | string;
  funded_trees: number | string;
  co2_kg_per_year: number | string;
  sponsor_count: number | string;
}

interface CommunityForestContributionRow {
  sponsor_wallet: string;
  display_name: string | null;
  trees_contributed: number | string;
  trees_planted: number | string;
  co2_kg_per_year: number | string;
}

interface CommunityForestMilestoneRow {
  threshold_trees: number;
  title: string;
  trees_at_celebration: number | string;
  celebrated_at: Date | string;
}

/** SQL fragment listing the tree statuses that count as planted. */
const PLANTED_STATUS_SQL = `('${PLANTED_TREE_STATUSES.join("', '")}')`;

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoString(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function mapProject(row: CommunityForestProjectRow): CommunityForestProject {
  return {
    id: String(row.id),
    name: row.name,
    description: row.description,
    baseProjectId: row.base_project_id,
    createdByKind: row.created_by_kind,
    createdById: row.created_by_id,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

// ── Projects ────────────────────────────────────────────────────────────────

export interface InsertCommunityForestProjectParams {
  name: string;
  description: string | null;
  baseProjectId: string;
  createdByKind: CommunityForestCreatorKind;
  createdById: string;
}

/** Persists a new community forest project. */
export async function insertCommunityForestProject(
  pool: CommunityForestPool,
  params: InsertCommunityForestProjectParams
): Promise<CommunityForestProject> {
  const result = await pool.query<CommunityForestProjectRow>(
    `INSERT INTO community_forest_projects
       (name, description, base_project_id, created_by_kind, created_by_id, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     RETURNING id, name, description, base_project_id, created_by_kind, created_by_id,
               status, created_at, updated_at`,
    [
      params.name,
      params.description,
      params.baseProjectId,
      params.createdByKind,
      params.createdById,
    ]
  );

  const row = result.rows[0];
  if (!row) throw new Error('Community forest project was not created');
  return mapProject(row);
}

/** Reads a single community forest project. */
export async function selectCommunityForestProject(
  pool: CommunityForestPool,
  projectId: string
): Promise<CommunityForestProject | null> {
  const result = await pool.query<CommunityForestProjectRow>(
    `SELECT id, name, description, base_project_id, created_by_kind, created_by_id,
            status, created_at, updated_at
     FROM community_forest_projects
     WHERE id = $1`,
    [projectId]
  );

  const row = result.rows[0];
  return row ? mapProject(row) : null;
}

/** A project row enriched with the collective impact of the project. */
export interface CommunityForestSummaryRow extends CommunityForestProjectRow {
  total_trees: number | string;
  planted_trees: number | string;
  co2_kg_per_year: number | string;
  sponsor_count: number | string;
}

/**
 * Lists every community forest project with its collective impact, in a
 * single query so the listing page never fans out into N+1 queries.
 */
export async function selectCommunityForestProjectSummaries(
  pool: CommunityForestPool
): Promise<CommunityForestSummaryRow[]> {
  const result = await pool.query<CommunityForestSummaryRow>(
    `SELECT p.id, p.name, p.description, p.base_project_id, p.created_by_kind,
            p.created_by_id, p.status, p.created_at, p.updated_at,
            COALESCE(trees.total_trees, 0) AS total_trees,
            COALESCE(trees.planted_trees, 0) AS planted_trees,
            COALESCE(trees.co2_kg_per_year, 0) AS co2_kg_per_year,
            COALESCE(members.sponsor_count, 0) AS sponsor_count
     FROM community_forest_projects p
     LEFT JOIN (
       SELECT cft.project_id,
              COUNT(*) AS total_trees,
              COUNT(*) FILTER (WHERE t.status IN ${PLANTED_STATUS_SQL}) AS planted_trees,
              COALESCE(SUM(COALESCE(sc.co2_kg_per_year, 0))
                FILTER (WHERE t.status IN ${PLANTED_STATUS_SQL}), 0) AS co2_kg_per_year
         FROM community_forest_trees cft
         JOIN trees t ON t.id = cft.tree_id AND t.deleted_at IS NULL
         LEFT JOIN species_catalogue sc ON sc.slug = t.species_slug
        GROUP BY cft.project_id
     ) trees ON trees.project_id = p.id
     LEFT JOIN (
       SELECT project_id, COUNT(*) AS sponsor_count
         FROM community_forest_members
        GROUP BY project_id
     ) members ON members.project_id = p.id
     ORDER BY p.created_at DESC, p.id DESC`
  );

  return result.rows;
}

// ── Members ─────────────────────────────────────────────────────────────────

export interface InsertCommunityForestMemberParams {
  projectId: string;
  sponsorWallet: string;
  displayName: string | null;
  role: CommunityForestMemberRole;
}

/**
 * Adds a sponsor to a community forest. Returns `null` when the sponsor is
 * already a member — the unique key on `(project_id, sponsor_wallet)` makes
 * duplicate participation impossible.
 */
export async function insertCommunityForestMember(
  pool: CommunityForestPool,
  params: InsertCommunityForestMemberParams
): Promise<CommunityForestMember | null> {
  const result = await pool.query<CommunityForestMemberRow>(
    `INSERT INTO community_forest_members (project_id, sponsor_wallet, display_name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_id, sponsor_wallet) DO NOTHING
     RETURNING sponsor_wallet, display_name, role, joined_at`,
    [params.projectId, params.sponsorWallet, params.displayName, params.role]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    sponsorWallet: row.sponsor_wallet,
    displayName: row.display_name,
    role: row.role,
    joinedAt: toIsoString(row.joined_at),
  };
}

/** Lists the sponsors taking part in a community forest. */
export async function selectCommunityForestMembers(
  pool: CommunityForestPool,
  projectId: string
): Promise<CommunityForestMember[]> {
  const result = await pool.query<CommunityForestMemberRow>(
    `SELECT sponsor_wallet, display_name, role, joined_at
     FROM community_forest_members
     WHERE project_id = $1
     ORDER BY joined_at ASC, sponsor_wallet ASC`,
    [projectId]
  );

  return result.rows.map((row) => ({
    sponsorWallet: row.sponsor_wallet,
    displayName: row.display_name,
    role: row.role,
    joinedAt: toIsoString(row.joined_at),
  }));
}

/** True when the sponsor is a member of the project. */
export async function isCommunityForestMember(
  pool: CommunityForestPool,
  projectId: string,
  sponsorWallet: string
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM community_forest_members
     WHERE project_id = $1 AND sponsor_wallet = $2`,
    [projectId, sponsorWallet]
  );

  return (result.rowCount ?? 0) > 0;
}

// ── Impact ──────────────────────────────────────────────────────────────────

/** Aggregates the collective impact of a community forest. */
export async function selectCommunityForestImpact(
  pool: CommunityForestPool,
  projectId: string
): Promise<CommunityForestImpact> {
  const result = await pool.query<CommunityForestImpactRow>(
    `SELECT
       (SELECT COUNT(*)
          FROM community_forest_trees cft
          JOIN trees t ON t.id = cft.tree_id
         WHERE cft.project_id = $1 AND t.deleted_at IS NULL) AS total_trees,
       (SELECT COUNT(*)
          FROM community_forest_trees cft
          JOIN trees t ON t.id = cft.tree_id
         WHERE cft.project_id = $1 AND t.deleted_at IS NULL
           AND t.status IN ${PLANTED_STATUS_SQL}) AS planted_trees,
       (SELECT COUNT(*)
          FROM community_forest_trees cft
          JOIN trees t ON t.id = cft.tree_id
         WHERE cft.project_id = $1 AND t.deleted_at IS NULL
           AND t.status = 'funded') AS funded_trees,
       (SELECT COALESCE(SUM(COALESCE(sc.co2_kg_per_year, 0)), 0)
          FROM community_forest_trees cft
          JOIN trees t ON t.id = cft.tree_id
          LEFT JOIN species_catalogue sc ON sc.slug = t.species_slug
         WHERE cft.project_id = $1 AND t.deleted_at IS NULL
           AND t.status IN ${PLANTED_STATUS_SQL}) AS co2_kg_per_year,
       (SELECT COUNT(*) FROM community_forest_members WHERE project_id = $1) AS sponsor_count`,
    [projectId]
  );

  const row = result.rows[0];
  return {
    totalTrees: toNumber(row?.total_trees),
    plantedTrees: toNumber(row?.planted_trees),
    fundedTrees: toNumber(row?.funded_trees),
    co2KgPerYear: toNumber(row?.co2_kg_per_year),
    sponsorCount: toNumber(row?.sponsor_count),
  };
}

/** Per-sponsor contributions of a community forest, used for the leaderboard. */
export async function selectCommunityForestContributions(
  pool: CommunityForestPool,
  projectId: string
): Promise<CommunityForestSponsorContribution[]> {
  const result = await pool.query<CommunityForestContributionRow>(
    `SELECT m.sponsor_wallet,
            m.display_name,
            COUNT(cft.tree_id) FILTER (WHERE t.id IS NOT NULL) AS trees_contributed,
            COUNT(cft.tree_id) FILTER (
              WHERE t.id IS NOT NULL AND t.status IN ${PLANTED_STATUS_SQL}
            ) AS trees_planted,
            COALESCE(SUM(COALESCE(sc.co2_kg_per_year, 0)) FILTER (
              WHERE t.id IS NOT NULL AND t.status IN ${PLANTED_STATUS_SQL}
            ), 0) AS co2_kg_per_year
     FROM community_forest_members m
     LEFT JOIN community_forest_trees cft
       ON cft.project_id = m.project_id AND cft.contributed_by = m.sponsor_wallet
     LEFT JOIN trees t ON t.id = cft.tree_id AND t.deleted_at IS NULL
     LEFT JOIN species_catalogue sc ON sc.slug = t.species_slug
     WHERE m.project_id = $1
     GROUP BY m.sponsor_wallet, m.display_name, m.joined_at
     ORDER BY trees_planted DESC, trees_contributed DESC, m.sponsor_wallet ASC`,
    [projectId]
  );

  return result.rows.map((row) => ({
    sponsorWallet: row.sponsor_wallet,
    displayName: row.display_name,
    treesPlanted: toNumber(row.trees_planted),
    treesContributed: toNumber(row.trees_contributed),
    co2KgPerYear: toNumber(row.co2_kg_per_year),
  }));
}

// ── Contributions & milestones ──────────────────────────────────────────────

export interface InsertCommunityForestTreeParams {
  projectId: string;
  treeRef: string;
  contributedBy: string;
}

/** Where a tree is already attributed, if it is. */
export interface CommunityForestTreeClaim {
  treeId: string;
  /** Id of the community forest the tree already belongs to. */
  communityForestProjectId: string | null;
}

/**
 * Looks up a tree and the community forest it already belongs to, so the
 * service can tell "unknown tree" apart from "tree already attributed".
 */
export async function selectCommunityForestTreeClaim(
  pool: CommunityForestPool,
  treeRef: string
): Promise<CommunityForestTreeClaim | null> {
  const result = await pool.query<{
    id: number | string;
    community_forest_project_id: number | string | null;
  }>(
    `SELECT t.id, cft.project_id AS community_forest_project_id
     FROM trees t
     LEFT JOIN community_forest_trees cft ON cft.tree_id = t.id
     WHERE t.tree_ref = $1 AND t.deleted_at IS NULL`,
    [treeRef]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    treeId: String(row.id),
    communityForestProjectId:
      row.community_forest_project_id === null ? null : String(row.community_forest_project_id),
  };
}

export interface InsertCommunityForestTreeResult {
  /** False when the tree is unknown, already contributed, or already claimed. */
  contributed: boolean;
  /** Trees planted in the project after this contribution. */
  plantedTrees: number;
}

/**
 * Attributes a tree to a community forest and returns the new planted count.
 *
 * The whole thing happens in a single statement, so a concurrent contribution
 * cannot observe a half-applied state. Postgres does not let the main query of
 * a statement see the rows a data-modifying CTE inserted, so the planted trees
 * of the new contribution are counted separately and added to the trees the
 * statement already saw.
 */
export async function insertCommunityForestTree(
  pool: CommunityForestPool,
  params: InsertCommunityForestTreeParams
): Promise<InsertCommunityForestTreeResult> {
  const result = await pool.query<{ contributed: number | string; planted_trees: number | string }>(
    `WITH inserted AS (
       INSERT INTO community_forest_trees (project_id, tree_id, contributed_by)
       SELECT $1, t.id, $3
         FROM trees t
        WHERE t.tree_ref = $2 AND t.deleted_at IS NULL
        ON CONFLICT DO NOTHING
       RETURNING tree_id
     )
     SELECT (SELECT COUNT(*) FROM inserted) AS contributed,
            (SELECT COUNT(*)
               FROM community_forest_trees cft
               JOIN trees t ON t.id = cft.tree_id
              WHERE cft.project_id = $1 AND t.deleted_at IS NULL
                AND t.status IN ${PLANTED_STATUS_SQL})
          + (SELECT COUNT(*)
               FROM inserted i
               JOIN trees t ON t.id = i.tree_id
              WHERE t.deleted_at IS NULL
                AND t.status IN ${PLANTED_STATUS_SQL}) AS planted_trees`,
    [params.projectId, params.treeRef, params.contributedBy]
  );

  const row = result.rows[0];
  return {
    contributed: toNumber(row?.contributed) > 0,
    plantedTrees: toNumber(row?.planted_trees),
  };
}

export interface InsertCommunityForestMilestoneParams {
  projectId: string;
  /** Trees planted in the project — every threshold up to it is reached. */
  plantedTrees: number;
  /** Configured thresholds that still have to be celebrated. */
  thresholds: ReadonlyArray<{ thresholdTrees: number; title: string }>;
}

/**
 * Celebrates the milestones a project has reached. Only the rows that were
 * actually inserted are returned, so a milestone is never celebrated twice —
 * not on a later page load, and not by a concurrent contribution.
 */
export async function insertCommunityForestMilestoneCelebrations(
  pool: CommunityForestPool,
  params: InsertCommunityForestMilestoneParams
): Promise<CommunityForestMilestoneCelebration[]> {
  if (params.thresholds.length === 0) return [];

  const thresholdValues = params.thresholds.map((threshold) => threshold.thresholdTrees);
  const titleValues = params.thresholds.map((threshold) => threshold.title);

  const result = await pool.query<CommunityForestMilestoneRow>(
    `INSERT INTO community_forest_milestones
       (project_id, threshold_trees, title, trees_at_celebration)
     SELECT $1, thresholds.threshold_trees, thresholds.title, $3
       FROM unnest($2::int[], $4::text[]) AS thresholds(threshold_trees, title)
      WHERE thresholds.threshold_trees <= $3
     ON CONFLICT (project_id, threshold_trees) DO NOTHING
     RETURNING threshold_trees, title, trees_at_celebration, celebrated_at`,
    [params.projectId, thresholdValues, params.plantedTrees, titleValues]
  );

  return result.rows.map((row) => ({
    thresholdTrees: row.threshold_trees,
    title: row.title,
    treesAtCelebration: toNumber(row.trees_at_celebration),
    celebratedAt: toIsoString(row.celebrated_at),
  }));
}

/** Lists the milestones a community forest has already celebrated. */
export async function selectCommunityForestMilestones(
  pool: CommunityForestPool,
  projectId: string
): Promise<CommunityForestMilestoneCelebration[]> {
  const result = await pool.query<CommunityForestMilestoneRow>(
    `SELECT threshold_trees, title, trees_at_celebration, celebrated_at
     FROM community_forest_milestones
     WHERE project_id = $1
     ORDER BY threshold_trees DESC`,
    [projectId]
  );

  return result.rows.map((row) => ({
    thresholdTrees: row.threshold_trees,
    title: row.title,
    treesAtCelebration: toNumber(row.trees_at_celebration),
    celebratedAt: toIsoString(row.celebrated_at),
  }));
}

/** Celebrated milestones of every project, used by the listing page. */
export async function selectCommunityForestMilestonesForProjects(
  pool: CommunityForestPool
): Promise<Map<string, CommunityForestMilestoneCelebration[]>> {
  const result = await pool.query<CommunityForestMilestoneRow & { project_id: number | string }>(
    `SELECT project_id, threshold_trees, title, trees_at_celebration, celebrated_at
     FROM community_forest_milestones
     ORDER BY threshold_trees DESC`
  );

  const byProject = new Map<string, CommunityForestMilestoneCelebration[]>();
  for (const row of result.rows) {
    const key = String(row.project_id);
    const celebrations = byProject.get(key) ?? [];
    celebrations.push({
      thresholdTrees: row.threshold_trees,
      title: row.title,
      treesAtCelebration: toNumber(row.trees_at_celebration),
      celebratedAt: toIsoString(row.celebrated_at),
    });
    byProject.set(key, celebrations);
  }

  return byProject;
}
