# presales (change 020)

Opportunities from new idea to won or lost: a board with explicit, audited moves, each opportunity's stage history, activities, tasks and risks, calculated health, and promotion of a won deal to a delivery project.

- **Owner:** `/modules/presales/` in `.github/CODEOWNERS`
- **Screens:** `/presales` (board or list, tickets, agent finds, pipeline chart, recent stage changes), `/presales/o/:number` (opportunity, e.g. `PS-0142`)
- **Contracts** (`contracts.ts`): `listOpportunityRefs`, `getOpportunityRef`, `pipelineTotals`, `numberOf`, `STAGES`, `OPEN_STAGES`, `EVENTS`, and the `OpportunityStageChanged` / `OpportunityPromoted` payload types
- **Events:** `presales.opportunity.stage_changed` (every move or win-chance change; lost carries its reason), `presales.opportunity.promoted` (client, cost centre, team and estimate carry over)
- **MCP tools** (`mcp.ts`): read — `list_opportunities`, `get_opportunity`, `get_opportunity_item`, `get_suggestion`, `pipeline_summary`; write — `create_opportunity`, `move_opportunity`, `log_opportunity_activity`, `add_opportunity_task`, `add_opportunity_risk`, `close_opportunity_risk`, `remove_opportunity`, `resolve_suggestion`, `promote_opportunity`
- **Chat-first (046).** The screens have no forms. Each write is an "Ask amax" chip that opens chat with the record pinned and a prompt filled in; the write runs only after the confirm card. Every card, tile and row has a pin.
- **Chat intent** (`chat.ts`): new opportunity ("Fill with amax" and "Open in chat" on the board)
- **Job:** `presales.pipeline-snapshot` on the 1st of each month records last month's closing pipeline for the chart
- **Money:** each opportunity keeps its own amount and currency plus the USD rate it was converted at (`presales.fx_rate`); the pipeline is reported in USD
- **Health** is calculated from open risks, never typed: an open high-impact issue is red; an open high-impact risk or any open issue is amber
- **Depends on delivery (007).** Promote to delivery calls delivery's project creation through `@amax/delivery/contracts`. Delivery's contract doesn't export `createProject` yet, so until it does, Promote is shown disabled with that reason and `promote_opportunity` refuses; nothing else depends on it. Finance (017) is not used.
- **Data:** `presales.client`, `fx_rate`, `opportunity`, `stage_change`, `activity`, `task`, `risk`, `suggestion`, `pipeline_snapshot` (all RLS on `tenant_id`); retention entries in `module.ts`
- **Tests:** `pnpm --filter @amax/presales test` (DB tests need `DATABASE_MIGRATE_URL`); screens: `pnpm --filter @amax/web build && pnpm --filter @amax/presales e2e`
