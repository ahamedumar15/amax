# 081 audit: Delivery → Proposals, as built at `64c6bbc9`

Each finding below was checked against the code. Where a path is cited, it was read. This is also the progress log:
`## Progress` at the end is updated as phases land.

## Architecture map

| Layer | Where | Notes |
|---|---|---|
| Registration | `modules/delivery/module.ts` | nav `proposals`; routes `proposals`, `proposals/:phase`, `p/:key/proposals[/:phase]`; no detail route |
| Schema | `delivery.proposal` (0001, 0012 created_at, 0013, 0015 tasks, 0017 synced_commit_at) | `hours numeric` static, `owner_name text` only, `meta.withdrawn` used by specclaw only |
| Reads | `server/queries.ts` `listProposals`, `getProject`, `getProposal` (filters full list), `phaseCounts`, `shippedPerWeek` | `ACTIVE` = not `meta.withdrawn`; no project-status filter |
| Writes | `server/services.ts` `createProposal`, `moveProposal`, `syncProposal`/`upsertSpecProposal`, release + deployment services; `server/tasks.ts` `markTaskDone`; `server/push.ts` `sync_specclaw` | all `defineService` (permission, audit, events) |
| MCP | `mcp.ts` | `create_proposal` input has no owner; no update/withdraw/add-task |
| Chat | `chat.ts` intents; no `chatSuggestions` | `delivery.new-proposal` always asks "Which project?" |
| UI | `ui/ProposalsPage.tsx` (global + shared `ProposalsTable`), `ui/ProjectLists.tsx`, `ui/ProjectPage.tsx` board | rows and cards not linked |
| Events | `contracts.ts` `EVENTS` | `proposal.phase_changed`, `task.done` emitted; no notification uses them |
| Time | `modules/time/server/log.ts` `logEntry`; `suggestions.ts` `commitDraft`; `contracts.ts` | `time.entry` has `project_id` only |

### Operation traces

- **Create (UI/chat):** `IntentButton delivery.new-proposal` → chat fills `create_proposal` → confirm card →
  `createProposal` (`delivery:proposal:create`, `scoped` on project) → insert row with `owner_name = input.ownerName`
  (never passed by the tool, so it's always null) → audit `delivery.proposal.create` → no event. The page refreshes on
  the next navigation.
- **Move:** `AskButton Move` (board card) → `move_proposal` → `moveProposal` refuses Released and any `source` → update
  phase → `proposal.phase_changed`.
- **Sync (CI):** `sync/bin.ts` → `syncSpecclaw` → `syncProposal` per changed record (service principal, acting for
  nobody) → `upsertSpecProposal` (Released sticky, rekeys a hand-made row on a spec key) → tasks `writeTasks`. Folders
  that are gone get `meta.withdrawn`.
- **Push (plugin):** `sync_specclaw` → `pushSpecclaw` (repo link, `delivery:proposal:push`, stale/back/released checks,
  dry-run via rollback) → same upsert. No owner either way.
- **Commit ingest:** `inbound` → `ingestPush` → `markTaskDone` per `T<n>`. `Time: 1.5h` → `draftCommitTime` → event
  `delivery.commit.time {proposalKey}` → Time `commitTimeHandler` → suggestion → accept → `logEntry` with `note =
  "<key>, commit …"`. **The proposal link is lost here.**
- **Release:** `record_deployment` on Prod → proposals in release → `released` + `prior_phases`; `void_deployment`
  restores them. Rollback notification to PMs.

## Findings

| # | Finding | Evidence | Status |
|---|---|---|---|
| F1 | Proposal hours never change: `delivery.proposal.hours` is written only by fixtures | `grep hours modules/delivery` (only fixtures/UI read it) | **broken** → AC-1..4 |
| F2 | `time.entry` can't name a proposal; `log_time` has no proposal input | `time/db/migrations/0001_time.sql`, `time/server/log.ts` input | **missing** → AC-1 |
| F3 | Accepting a commit-time suggestion drops `proposalKey` into the note | `time/suggestions.ts:31` | **broken** → AC-2 |
| F4 | No Time contract for hours per proposal | `time/contracts.ts` | **missing** → AC-4 |
| F5 | No owner on hand-made (tool lacks it), synced or pushed proposals; no `owner_user_id` at all | `services.ts createProposal`, `upsertSpecProposal` insert | **broken** → AC-5 |
| F6 | No single-proposal page; search hit, rows and cards go to the board or nowhere | `module.ts` routes, `mcp.ts search` | **missing** → AC-6, AC-7 |
| F7 | `get_proposal` loads every proposal to find one; hides withdrawn | `queries.ts getProposal` | **inefficient/incomplete** → AC-8 |
| F8 | Hand-made proposals can't be edited, withdrawn or given tasks | `mcp.ts` | **missing** → AC-9..11 |
| F9 | Global and project lists have no Planned filter | `ProposalsPage.tsx FILTERS` | **broken** → AC-15 |
| F10 | Shipped-per-week pin opens `list_proposals` | `ProposalsPage.tsx` pin | **wrong** → AC-17 |
| F11 | Phase counts ignore the project filter; counts, list and shipped include closed projects while the project filter offers only active ones | `phaseCounts`, `shippedPerWeek`, `listProposals` | **inconsistent** → AC-16 |
| F12 | Global page has no New proposal; project page's button doesn't carry the project | `ProposalsPage.tsx`, `ProjectPage.tsx IntentButton` | **UX** → AC-13 |
| F13 | Delivery has no `chatSuggestions` | `module.ts` vs `time/module.ts` | **missing** → AC-13 |
| F14 | No notification for `proposal.phase_changed` / `task.done` | `module.ts notifications` | **missing** → AC-19 |
| F15 | Five rows per page; no search; CSV exports only the current filter (fine) | `ProposalsTable PAGE = 5` | **UX** → AC-16 |
| F16 | Engineers can move a proposal to Planned; PRODUCT.md says PMs approve proposals | `module.ts grants`, PRODUCT.md:19 | **decision** D1 |
| F17 | No phase-history store; the audit log has every move, sync and release | `appendAudit` via `defineService` | use audit (AC-6) |
| F18 | Retention lists `owner_name`; an `owner_user_id` must join it | `module.ts retention` | → AC-5 |

### Verified working (kept, regression-tested in AC-18)

- Released only from a Prod deployment; `moveProposal` refuses Released and synced rows.
- `void_deployment` restores `prior_phases`; falls back to Verified for old records.
- Sync and push never move Released back; push refuses a step back, stale commits, and other repos.
- Hand-made proposals rekey to the `-H` series when a spec change claims their key; the event and audit fire.
- Tasks closed by commits stay closed across syncs.
- Tenant isolation: every table is tenant-RLS (`core.enable_tenant_rls`); reads go through `withTenant`.

## Progress

- [x] Phase 1: data model and contracts: migrations (delivery 0019, time 0009); Delivery `getProposalRef`, `setProposalHours`, `proposalHref`, `proposal.withdrawn` event; Time `refreshProposalHours` and its handlers. Decision: Time pushes approved totals to Delivery (R5 forbids Delivery → Time)
- [x] Phase 2: time association and ownership: `log_time`, `correct_time_entry` (and change requests) take `proposalKey`, checked through `getProposalRef`; commit drafts keep it (unless withdrawn since); owners from the acting person on create, sync and push (a later sync fills a missing owner, never replaces one); "Unassigned" shown; creating in a closed project is refused
- [x] Phase 3: detail page and navigation: `/delivery/proposals/:key` (shares the `:phase` segment; a non-phase is a key), history from `core.audit_event` + `proposal.phase_changed` events, linked from list rows, board cards, release page, search; `get_proposal` reads one row and returns tasks, stages, history and `href`
- [x] Phase 4: update, withdraw and add-task: `update_proposal`, `withdraw_proposal` (destructive, reason, leaves its release; release row locked first), `add_proposal_task`; spec proposals refused except owner; withdrawn ones refused by move, release assignment and Prod release; page actions by permission
- [x] Phase 5: creation and chat: New proposal on the global page (carries a filtered project) and the project page (carries the project, shown only to who may create there); intent asks no project when one is pinned; Delivery `chatSuggestions` and `pageLabel`; `create_proposal` gets `propose` (no card for unknown, closed or out-of-scope projects) and a card with project, title, description, estimate, owner
- [x] Phase 6: filters, metrics, pins, export: Planned filter on both lists; one filter (`scope` in queries.ts) for list, counts and shipped chart: never withdrawn, active projects unless a project is named, project filter, `q` search; Overview proposal counts follow it; 20 a page; CSV = every filtered row; `get_proposal_metrics` backs both card pins
- [x] Phase 7: notifications and lifecycle consistency: `ownerUserId` added to `proposal.phase_changed` and `task.done` payloads; rules `delivery.proposal-phase` and `delivery.proposal-task-done` tell the owner (not when they or an agent for them acted), linking the proposal page; regression test for Prod release, void, sync and withdrawn-in-release. Open: notifications `time-routing.test` fails here on unrelated it-access/recruitment handlers; compare on main in the Linux CI replica (T8)
- [x] Phase 8: tests, verification, docs: e2e (search, list, board, reload, axe, not found); READMEs; 007's Proposals mock section updated (agreed); search class fix; Linux CI replica all green (see change.md `## Verify`). The notifications `time-routing` open item is closed: it passes on Linux and only fails on Windows
