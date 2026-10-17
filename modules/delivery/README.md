# delivery (changes 007, 039, 042)

Projects, each project's board of specclaw proposals, and releases moving through each project's own environments. "Released" means a release reached the project's Prod environment; a project may have none.

- **Owner:** `/modules/delivery/` in `.github/CODEOWNERS`
- **Screens:** `/delivery` (portfolio), `/delivery/p/:key` (board + environments), `/delivery/proposals[/:phase]`, `/delivery/releases`, `/delivery/releases/:projectKey/:version`
- **Contracts** (`contracts.ts`): `listProjectRefs`, `getProjectRef`, `managedProjectIds`, `PHASES`, `EVENTS`, and the `ReleaseDeployed` / `ProposalPhaseChanged` payload types
- **Events:** `delivery.release.deployed`, `delivery.proposal.phase_changed`
- **MCP tools** (`mcp.ts`): read — `list_projects`, `get_project`, `list_proposals`, `get_release`, `list_environments`, `get_release_history`; write — `create_project`, `create_proposal`, `move_proposal`, `create_release`, `tag_release`, `set_release_proposals`, `record_deployment`, `upsert_environment`, `remove_environment`, `void_deployment`
- **Chat intents** (`chat.ts`): new project, new proposal, new release, record a deployment, change a release
- **Viewer scopes:** contributes each user's managed projects, so `@managed` grants work
- **Self-sync (039):** `sync/` imports a repo's `.specclaw/changes` into a project (`pnpm --filter @amax/delivery sync:specclaw`)
- **Data:** `delivery.project`, `proposal`, `release`, `environment`, `deployment` (all RLS on `tenant_id`); retention entries in `module.ts`
- **Tests:** `pnpm --filter @amax/delivery test` (DB tests need `DATABASE_MIGRATE_URL`)
