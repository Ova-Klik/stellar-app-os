# Community forest projects (Issue #1646)

A **community forest** is a *named* project several sponsors pool their
sponsorship into. It always grows from an existing project of the platform
catalogue (the *base project*), so the platform keeps a single project concept:
the base project owns the type, location, description and verification status,
while the community forest adds the pooled sponsorship layer — participants,
collective impact, group leaderboard and milestone celebrations — on top of it.

Implementation: `lib/community-forest/` (types, validation, project catalogue,
milestones, leaderboard, store, service, permissions), wired through
`app/api/community-forests/**` and rendered by
`components/organisms/CommunityForestDirectory` and
`components/organisms/CommunityForestDashboard`.

Persistence: `db/migrations/028_create_community_forests.sql` (mirrored in
`prisma/schema.prisma`).

## Roles

| Actor | Can do |
| --- | --- |
| **Platform admin** | Create a community forest project (`farmcredit_role=admin` cookie) |
| **Certified partner organisation** | Create a community forest project by proving its certification |
| **Sponsor (Stellar wallet)** | Join a community forest, contribute a tree it funded, appear on the leaderboard |

Creation is authorised on the server, never from client supplied role data:

- admins are recognised by the admin role cookie (`lib/auth/admin.ts`);
- an organisation must hold an approved, unexpired tree planting certification
  (`lib/partner-certification.ts`) **and** send the contact email the
  certification was issued for, which proves it owns the certification.

## API

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/community-forests` | `GET` | Lists the projects with their collective impact |
| `/api/community-forests` | `POST` | Creates a project (admin or certified organisation) |
| `/api/community-forests/:projectId` | `GET` | Collective impact dashboard, leaderboard and milestones |
| `/api/community-forests/:projectId/members` | `POST` | Joins a sponsor to the project |
| `/api/community-forests/:projectId/contributions` | `POST` | Attributes a tree to the project and celebrates the milestones it reached |

Errors use `{ error }` with the status in the HTTP code: `400` for an invalid
payload, `403` when the caller may not create the project or is not taking part
in it, `404` for an unknown project or tree and `409` when the sponsor already
takes part in the project or the tree is already attributed to one.

## Collective impact

The impact of a project is always derived from the trees that are actually
attributed to it:

- `totalTrees` — every tree attributed to the project;
- `plantedTrees` — the trees that are in the ground (`planted`, `verified` or
  `completed`);
- `fundedTrees` — the trees that are funded but not planted yet;
- `co2KgPerYear` — the annual CO₂ sequestration of the planted trees, taken
  from `species_catalogue.co2_kg_per_year`.

Money is **never** converted into trees: the platform has no conversion rule
for that, so a milestone can only be reached by real trees.

## Leaderboard

The group leaderboard ranks the sponsors of a project by **trees planted** —
the same metric the milestones use, so the board and the celebrations never
disagree. Sponsors with the same number of planted trees share a rank and the
next rank is skipped (standard competition ranking: 1, 2, 2, 4). Sponsors
without any contribution are still listed. Ties are broken deterministically by
trees contributed and then by wallet, so the order never depends on the input
order.

## Milestones

Every community forest celebrates the same ladder of thresholds, configured in
`lib/community-forest/milestones.ts` (100, 500, 1,000, 5,000 and 10,000 trees
planted), mirroring the sponsor badge configuration pattern.

A milestone is persisted per project in `community_forest_milestones` with a
unique key on `(project_id, threshold_trees)`, and the insert uses
`ON CONFLICT DO NOTHING … RETURNING`. Only the rows that were actually
inserted are returned, so a milestone is never celebrated twice — not on a
later page load, and not by two concurrent contributions. A single contribution
that crosses several thresholds celebrates all of them; none is skipped.

## Data integrity

| Table | Key | Guarantee |
| --- | --- | --- |
| `community_forest_members` | `PRIMARY KEY (project_id, sponsor_wallet)` | A sponsor joins a project only once |
| `community_forest_trees` | `UNIQUE (tree_id)` | A tree is counted for a single community forest, so the collective impact is never inflated |
| `community_forest_milestones` | `UNIQUE (project_id, threshold_trees)` | A milestone is celebrated once |

## Testing

```bash
pnpm exec vitest run lib/community-forest app/api/community-forests \
  components/organisms/__tests__/CommunityForestDashboard.test.tsx
```

The suite covers the ranking rules, the milestone ladder and its de-duplication,
the input validation, the creation permissions (admin, certified organisation,
unauthorised) and the API routes end to end against a mocked pool.
