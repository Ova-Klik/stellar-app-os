-- Migration: 028_create_community_forests.sql
-- Issue #1646 — community forest projects with collective impact.
--
-- A community forest is a *named* project that several sponsors pool their
-- sponsorship into. It always grows from an existing platform project
-- (base_project_id) and adds three relations:
--   * community_forest_members   — the sponsors taking part (unique per project)
--   * community_forest_trees    — the trees attributed to the project
--   * community_forest_milestones — the milestones already celebrated
--
-- The unique keys are what make the feature safe:
--   * (project_id, sponsor_wallet) — a sponsor joins a project only once,
--   * tree_id                     — a tree is only counted once, so the
--                                   collective impact is never double counted,
--   * (project_id, threshold_trees) — a milestone is only celebrated once.

CREATE TABLE IF NOT EXISTS community_forest_projects (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
  description      TEXT CHECK (description IS NULL OR char_length(description) <= 500),
  -- Platform project the community forest grows from (e.g. 'proj-001').
  base_project_id  TEXT NOT NULL,
  -- 'admin' for platform admins, 'organisation' for certified partners.
  created_by_kind  TEXT NOT NULL CHECK (created_by_kind IN ('admin', 'organisation')),
  created_by_id    TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_forest_members (
  project_id      BIGINT NOT NULL REFERENCES community_forest_projects (id) ON DELETE CASCADE,
  sponsor_wallet  TEXT NOT NULL,
  display_name    TEXT,
  role            TEXT NOT NULL DEFAULT 'sponsor' CHECK (role IN ('creator', 'sponsor')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, sponsor_wallet)
);

CREATE TABLE IF NOT EXISTS community_forest_trees (
  project_id      BIGINT NOT NULL REFERENCES community_forest_projects (id) ON DELETE CASCADE,
  tree_id         BIGINT NOT NULL REFERENCES trees (id) ON DELETE CASCADE,
  contributed_by  TEXT NOT NULL,
  contributed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, tree_id)
);

-- A tree may only be counted for a single community forest, so the collective
-- impact of a project is never inflated by a shared tree.
CREATE UNIQUE INDEX IF NOT EXISTS uq_community_forest_trees_tree
  ON community_forest_trees (tree_id);

CREATE TABLE IF NOT EXISTS community_forest_milestones (
  id                   BIGSERIAL PRIMARY KEY,
  project_id           BIGINT NOT NULL REFERENCES community_forest_projects (id) ON DELETE CASCADE,
  threshold_trees      INTEGER NOT NULL CHECK (threshold_trees > 0),
  title                TEXT NOT NULL,
  trees_at_celebration INTEGER NOT NULL CHECK (trees_at_celebration >= 0),
  celebrated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_community_forest_milestones UNIQUE (project_id, threshold_trees)
);

CREATE INDEX IF NOT EXISTS idx_community_forest_members_wallet
  ON community_forest_members (sponsor_wallet);
CREATE INDEX IF NOT EXISTS idx_community_forest_trees_contributed_by
  ON community_forest_trees (project_id, contributed_by);
CREATE INDEX IF NOT EXISTS idx_community_forest_milestones_project
  ON community_forest_milestones (project_id, threshold_trees DESC);
