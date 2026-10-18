# Stable pins: keyed on ids, labels refreshed on read

**Change:** 059-stable-pins · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/chat` · **Follows:** 057 review (escalated class)

## Problem

The 057 review escalated a class it could not close in 5 rounds. Pins are stored with the record's name (release tag, environment name, proposal key), so a rename made outside the confirming person's chat leaves saved pins stale. That covers a rename over MCP, a rename by an agent or pipeline, and a specclaw sync rekey. A stale pin can even point at a different record if the old name is reused. Round 4 added "repin the confirming person's conversations", which covers only one path.

## Mock Delta

None. Pins look the same; a renamed record's pin shows its new name.

## Acceptance Criteria

1. **AC-1** Every `PinRef` resolves by a stable id (UUID), never by a name or key. Each read tool that resolves pins accepts an id. The tool registry rejects a pin-resolving read tool that has no id path, enforced by a check run at startup and in a test.
2. **AC-2** Old key-based pins in `chat.conversation` are migrated lazily. When a conversation is opened or a pin is resolved, a key-based pin is looked up once and rewritten to its id. If it can't be found, it shows as "No longer available" and is never resolved to a different record. A test reuses an old tag and shows the old pin doesn't move to the new release.
3. **AC-3** A pin's label is refreshed from the record each time it is read, so a rename via chat, MCP, agent or sync shows the new name everywhere without any repin step.
4. **AC-4** The 057 repin step (`packages/chat/src/repin.ts`, `doneOutcome`'s repin, the panel's `repinAll`) is removed.
5. **AC-5** A table test renames a release, an environment and a proposal (sync rekey) through each path: chat confirm, MCP call and job. Saved pins still resolve to the same record and show the new label.
6. **AC-6** Typecheck, unit tests, lint and both e2e suites stay green.

## Tasks

- [x] `T1` — UI: every record PinRef carries the record's UUID; the chat panel shows a pin that can't be found as "No longer available" and drops the repin merge (AC-1, AC-2, AC-4)
  Files: packages/ui/src/pins.ts, packages/ui/src/index.ts, packages/ui/src/components/PinButton.tsx, modules/delivery/pins.ts, modules/hr/pins.ts, modules/presales/pins.ts, modules/delivery/ui/*.tsx, modules/hr/ui/*.tsx, modules/presales/ui/*.tsx, apps/web/components/chat/Chat.tsx
- [x] `T2` — Core and registry: a read tool declares how a pin names what it shows (`pin: { id, of }` for one record, `"view"` otherwise); `createRegistry` refuses a record pin with no UUID id field or on a non-read tool, at startup and in a test (AC-1)
  Files: packages/core/src/module.ts, packages/core/src/index.ts, packages/mcp/src/registry.ts, packages/mcp/src/index.ts, packages/mcp/tests/pin-spec.test.ts
  Depends: T1
- [x] `T3` — Record read tools accept an id and return the record's current label: get_project, get_proposal (proposalId; key only narrows), releases, environments, deployments, get_person, get_opportunity, get_opportunity_item, get_suggestion, get_conversation, get_api_credential, get_webhook, get_workflow_run; pinned list and summary tools are marked `view`; delivery environments and proposals get a `created_at` (AC-1, AC-3)
  Files: modules/delivery/mcp.ts, modules/delivery/server/queries.ts, modules/delivery/db/migrations/0012_created_at.sql, modules/hr/mcp.ts, modules/hr/server/queries.ts, modules/presales/mcp.ts, modules/presales/server/queries.ts, modules/time/mcp.ts, modules/allocations/mcp.ts, packages/chat/src/tools.ts, packages/ai/src/usage-tool.ts, packages/mcp/src/audit-tools.ts, apps/web/lib/admin/*.ts
  Depends: T2
- [x] `T4` — Chat resolves pins in one place: id pins read their record and take its current label; a key-based pin is looked up once and rewritten to its id, or marked "No longer available" when it's gone or the record holding its key was made after the pin was saved; on a turn and when a conversation is opened (AC-2, AC-3)
  Files: packages/chat/src/pins.ts, packages/chat/src/resolve.ts, packages/chat/src/engine.ts, packages/chat/src/index.ts, apps/web/app/actions/chat-history.ts, apps/web/tests/chat-history-action.test.ts
  Depends: T2
- [x] `T5` — Remove the 057 repin: `repin.ts`, `repinAll`/`repinOf`/`relabel`, the services' `repin` results, `doneOutcome`'s repin; the panel refreshes its pins' labels after a confirm instead (AC-3, AC-4)
  Files: packages/chat/src/repin.ts, packages/chat/tests/repin.test.ts, modules/delivery/server/services.ts, apps/web/lib/chat-outcome.ts, apps/web/app/actions/chat.ts, apps/web/tests/chat-outcome.test.ts, apps/web/tests/chat-move.test.ts, modules/delivery/tests/chat-first.test.ts
  Depends: T4
- [x] `T6` — Tests: every PinRef in the UI names a tool with a pin spec and a record pin carries its id; lazy migration (an old tag reused does not move the pin); a table test renaming a release, an environment and a proposal (sync rekey) by chat confirm, MCP call and job, with saved pins still on the same record under the new label; R3 names the id rule (AC-1, AC-2, AC-3, AC-5, AC-6)
  Files: apps/web/tests/pin-refs.test.ts, modules/delivery/tests/stable-pins.test.ts, .specclaw/review/rules/R3-chat-first-and-pins.md
  Depends: T3, T4, T5

## Verify

**Verdict:** PASS

- AC-1: pass — `packages/core/src/module.ts` `PinSpec` (`{ id, of }` or `"view"`); `createRegistry` runs `checkPinSpec` on every tool at startup and refuses a record pin whose id field isn't a UUID or that sits on a non-read tool (`packages/mcp/tests/pin-spec.test.ts`, 6 cases). `apps/web/tests/pin-refs.test.ts` scans every `tool: "…", args` PinRef in `modules/*` and `apps/web/{app,components}` against the real `toolRegistry()`: each names a tool with a pin spec, and each record pin carries its id field. get_project, get_proposal, get_person and get_opportunity gained an id path (a key only narrows).
- AC-2: pass — `packages/chat/src/resolve.ts` `resolvePins`/`refreshSaved`/`openConversation`: on a turn and on reopen, a name-keyed pin is looked up once and rewritten to its id, or marked `unavailable` ("No longer available") when nothing is found or the record found was made after the pin was saved, and is never read again. `modules/delivery/tests/stable-pins.test.ts` "AC2": a pre-059 row with three key pins; the release is re-tagged and its old tag reused, the sync gives a proposal key to a new row; reopen gives No longer available for both and the environment pin moves onto its id, twice in a row; the next turn's model input carries the environment and the "no longer available" marker, never the new release's id. Negative check: dropping the made-after-save guard fails this test.
- AC-3: pass — record pins take `of(result).label` (plus their facet) every time they're read: each turn (`ChatTurn.pins`, merged by the panel with `withFresh`), each reopen, and after a confirmed write (`refreshPins` action). Covered by the AC-5 table below and `apps/web/tests/chat-move.test.ts`.
- AC-4: pass — `packages/chat/src/repin.ts` and its test deleted; `repin` results gone from `tagRelease`/`upsertEnvironment`; `doneOutcome` is synchronous with no repin (`apps/web/tests/chat-outcome.test.ts`); the panel's `repinAll` is replaced by `withFresh`. `grep -rn repin` finds only test names and the 057 follow-ups.
- AC-5: pass — `modules/delivery/tests/stable-pins.test.ts` "AC5": release (get_release, get_release_history with a facet, get_deployment pins) and environment renamed by chat confirm, MCP call and job (service with a `job` context), plus a proposal rekeyed by the specclaw sync (`syncProposal`, the job path; no chat or MCP tool rekeys a proposal). In all 7 cases the saved pins reopen with the same id args and the new name.
- AC-6: pass — commands below, all exit 0.

Commands:
- `pnpm lint` → 0 (tsc in every package + `amax graph check: ok`)
- `pnpm turbo run test --concurrency=1 --force` → 0 (17/17 tasks; run serially because the shared test Postgres hit "too many clients" under the default parallel run)
- `node scripts/check-module-standard.mjs` → 0 (`module standard: ok (5 modules)`)
- `pnpm build` → 0
- `pnpm --filter @amax/web e2e` (no DATABASE_URL, E2E_PORT=3558) → 0, 1 passed
- `pnpm --filter @amax/web e2e:auth` (E2E_DB=amax_059_e2e, E2E_AUTH_PORT=3559) → 0, 57 passed. A first run had one failure in `auth.spec.ts` AC5 (sign-out then /delivery not redirected); it passed on the rerun and touches nothing in this change.
- `specclaw-preset-check .` → 1: 895 repo-wide violations (comments, file length) that predate this change. The new files carry comments too, matching the surrounding code as the operator asked; `stable-pins.test.ts` is over 80 lines.
- `specclaw-quality-scan . --gate` → not run: the script fails on this repo (jq "Argument list too long").

Screens: Mock Delta is None. Pins look the same; the visual suites compare the screens with the mock and pass (`delivery-visual.spec.ts` at 1440 and 390 px, `api-visual.spec.ts`, `retention-visual.spec.ts`), and `pins.spec.ts` (every card and row has a pin) passes. Opportunity facet pins now read "PS-0142 <title>, details" rather than "PS-0142 details", so a renamed deal's title stays current; this text appears only in the pin's aria-label and chip.

Quality: not_run (specclaw-quality-scan failed: jq "Argument list too long" on this repo)
