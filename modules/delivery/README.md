# delivery (change 007)

Projects, each project's board of specclaw proposals, and releases moving through environments. "Released" means a release reached Prod.

- **Owner:** delivery team (`/modules/delivery/` in CODEOWNERS)
- **Screens:** `/delivery` (portfolio), `/delivery/p/:key` (board), `/delivery/proposals`, `/delivery/releases`
- **Contracts** (`contracts.ts`): `listProjectRefs`, `getProjectRef`, `managedProjectIds`, `PHASES`, event payload types
- **Events:** `delivery.release.deployed`, `delivery.proposal.phase_changed`
- **MCP tools** (`mcp.ts`, registered when 004 is installed): `list_projects`, `get_project`, `list_proposals`, `get_release`, `record_deployment` (PM/Admin)
- **Chat intents** (`chat.ts`): new project, new proposal, new release
- **Data:** `delivery.project`, `proposal`, `release`, `environment`, `deployment` (all RLS on `tenant_id`)
- **Tests:** `pnpm --filter @amax/delivery test` (DB tests need `DATABASE_MIGRATE_URL`)
