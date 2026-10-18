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
