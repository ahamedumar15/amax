# delivery (changes 007, 039, 041, 042)

Projects, each project's board of specclaw proposals, and releases moving through each project's own environments. "Released" means a release reached the project's Prod environment; a project may have none.

- **Owner:** `/modules/delivery/` in `.github/CODEOWNERS`
- **Screens:** `/delivery` (portfolio), `/delivery/p/:key` (board + environments), `/delivery/proposals[/:phase]`, `/delivery/releases`, `/delivery/releases/:projectKey/:version`
- **Contracts** (`contracts.ts`): `listProjectRefs`, `getProjectRef`, `managedProjectIds`, `PHASES`, `EVENTS`, and the `ReleaseDeployed` / `ProposalPhaseChanged` payload types
- **Events:** `delivery.release.deployed`, `delivery.proposal.phase_changed`
- **MCP tools** (`mcp.ts`): read — `list_projects`, `get_project`, `list_proposals`, `get_release`, `list_environments`, `get_release_history`; write — `create_project`, `create_proposal`, `move_proposal`, `create_release`, `tag_release`, `set_release_proposals`, `record_deployment`, `upsert_environment`, `remove_environment`, `void_deployment`
- **Chat intents** (`chat.ts`): new project, new proposal, new release, record a deployment, change a release
- **Viewer scopes:** contributes each user's managed projects, so `@managed` grants work
- **Self-sync (039):** `sync/` imports a repo's `.specclaw/changes` into a project (`pnpm --filter @amax/delivery sync:specclaw`)
- **Data:** `delivery.project`, `proposal`, `release`, `environment`, `deployment`, `weekly_stat` (task roll-ups; `project_id` null = the portfolio), `clock_pin` (all RLS on `tenant_id`); retention entries in `module.ts`
- **Charts (041):** "Tasks done per week" reads the portfolio roll-up (a missing week is a gap, not 0); "Shipped to Prod per week" counts `proposal.released_at`, the source of "Released this month". The fixtures follow fixtures.md except that series: the mock's W41 4 and W42 6 contradict its own 5 released this month, so the app shows W41 1 and W42 0. The Oct 6 "Login hotfix" is FLT's (release FLT v1.7.3), not an HRI proposal without a release: every released proposal has a release that reached Prod.
- **Today:** date windows use the tenant's `delivery.clock_pin` row when there is one (the e2e tenant pins Oct 16, 2026), else the real date.
- **Tests:** `pnpm --filter @amax/delivery test` (DB tests need `DATABASE_MIGRATE_URL`)
