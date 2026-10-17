# Module standard

Every module change (lanes other than Platform) must meet this before it is verified. CI checks the parts marked ✓auto.

**Checked as you work.** `scripts/check-graph.mjs` (no dependencies) enforces the boundary and graph rules. Project hooks in `.claude/settings.json` run it on every Claude Code edit under `modules/` or `packages/`, and in full before every `git commit` and `git push`; a violation blocks the action and says which rule broke. Run it yourself with `npm run check:graph`, and see the module and proposal graphs with `npm run graph`.

## Ownership and boundaries

- ✓auto **The change touches only `modules/<name>/`**, plus one `CODEOWNERS` line. Modules are discovered by scanning `modules/*/module.ts`, so no shared registry file is edited.
- ✓auto **Imports are limited** to `@amax/core`, `@amax/db`, `@amax/auth`, `@amax/ui`, `@amax/mcp`, `@amax/chat`, `@amax/agents`, `@amax/workflows`, and other modules' `contracts.ts`. Never another module's internals.
- **Writes go only to the module's own Postgres schema,** through `defineService()`, so every write is permission-checked, audited and emits its events.
- ✓auto **Every table has row-level security on `tenant_id`** (003); the leak test in `@amax/testing` runs against the module.
- ✓auto **Personal data is classified and has a retention rule.** Fields carry a 002 sensitivity class (`pay`, `health`, `bank`, `performance`, `candidate`), and every personal-data table has a 032 retention entry in the manifest. `scripts/check-module-standard.mjs` finds personal columns in the module's migrations (names, emails, notes, comments, `*_by`, pay and bank fields) and fails the module if that table has no entry. A table whose only personal columns are `user_id` or `person_id` holds pseudonymous ids and needs none. Name the row's person or matter in `subject` and its legal entity in `entity`, so holds, erasure and statutory minimums find it.
- **AI only through `@amax/ai`** (033). Untrusted text is passed as data, and agent output is a suggestion validated against its schema.
- **No credentials in code or env vars.** Connector secrets go through 031.
- **The mock is read-only during a build.** If a screen needs to change, propose it in its own small change.
- **Shared UI:** components start inside the module. Moving one into `@amax/ui` is a separate platform-lane change.

## Contracts first

- The module's first task publishes `contracts.ts`: types, read functions, event names and payloads, with stub implementations. Other lanes can build against it on day one.
- ✓auto **Contract tests** cover every exported function and event payload. Changing a contract after another module uses it needs a new version and a note in the module README.
- **Optional integrations** (the "Integrates with" line in the proposal) check `hasModule('<other>')` and degrade gracefully. ✓auto Tests run the module with and without each optional module installed.

## Required files

| File | Purpose |
|---|---|
| `module.ts` | Manifest: id, nav, permissions, routes, MCP tools, chat intents, workflows and schedules, notification rules, events, fixtures |
| `README.md` | What it does, who owns it, its contracts, its events, how to run its tests |
| `db/schema.ts`, `db/migrations/` | Its own schema; migrations touch only that schema |
| `contracts.ts` | The only import surface for other modules |
| `fixtures/` | Demo data consistent with `.specclaw/changes/001-amax-foundation/fixtures.md` |
| `tests/` | Service, contract, permission (including masked fields) and a11y tests |

## Operability

- ✓auto **Can be switched off:** removing the folder (or setting `AMAX_MODULES_DISABLED=<name>`) leaves the app building and running. Other modules lose only their optional features.
- **No host-specific APIs.** Files, scheduling, cache and environment go through `@amax/core` adapters, so the module runs on Vercel, Cloudflare and k3s.
- **Long or waiting work** (agent runs, reminders, syncs) is a `@amax/workflows` workflow, never a request handler that waits.
- **Agent actions** are `@amax/agents` suggestions that a person accepts, with undo.
- **Messages to people** are `notifications` rules, never sent directly.
