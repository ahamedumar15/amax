# amax Claude plugin: specclaw sync

**Change:** 062-specclaw-sync-plugin · **Created:** 2026-10-18
**Lane:** Delivery · **Module:** `modules/delivery` + `plugins/amax` · **Depends on:** [008](../008-delivery-ingestion/change.md), [039](../archive/039-specclaw-self-sync/change.md), [044](../archive/044-release-and-region-hardening/change.md)

## Problem

Proposal status in amax is only as fresh as the last time someone ran the 039 sync CLI. That CLI needs a
database URL and a service-principal token, so developers can't run it from their machines. Developers
already have amax over MCP in Claude Code and Claude Desktop. A plugin can read the repo's specclaw state
and push it through MCP. amax must still decide what it accepts: which person, which project and repo,
which phases, and whether anything changed.

## Mock Delta

What changes on screen, and where to see it: [`062-specclaw-sync-plugin`](../../mock/index.html#062-specclaw-sync-plugin)

New **Repo sync** card on a project: the linked repo, the last sync and who ran it (for example "Claude
for Kasun Dias"), counts for the last sync, and refused pushes with reasons. Each row is pinnable. Linking
or unlinking a repo goes through the "Ask amax" chat button. The plugin's dry-run output appears in the
same section.

## Acceptance Criteria

1. **AC-1** A Claude Code plugin at `plugins/amax/` (`.claude-plugin/plugin.json`, listed in a repo
   `.claude-plugin/marketplace.json`) installs with `/plugin install`. Its MCP config points at the amax
   MCP endpoint, and it ships one skill, `amax:sync-specclaw`. More skills can be added later without
   changing the layout.
2. **AC-2** `amax:sync-specclaw` reads `.specclaw/` in the current repo with the same rules as
   `modules/delivery/sync/specclaw.ts`: phase, tasks, ACs, PR and verdict. It finds the project from
   `.specclaw/config.yaml` `amax.project` and the `origin` remote URL. It calls `sync_specclaw` with
   `dryRun: true` first and shows the created, updated, unchanged and refused counts. It applies only
   when the user confirms, or when the run is unattended (AC-9).
3. **AC-3** The new MCP write tool `sync_specclaw` (in `modules/delivery/mcp.ts`, permission
   `delivery:proposal:push`) takes `{ projectKey, repoUrl, sha, ref, committedAt, records[], dryRun }`.
   It reuses 008/039's `syncSpecclaw()` (compare-before-write, done tasks stay done), so it writes only
   changed records, through `syncProposal`. It does not create projects and does not withdraw
   proposals. An unknown `projectKey` is refused. 008's `sync_proposal` stays as it is for CI.
4. **AC-4** **Repo binding:** a project syncs only from its linked repo. The write tools
   `link_project_repo` (with the default branch) and `unlink_project_repo` are for PM or Admin and go through the chat confirm.
   A push whose normalised `repoUrl` doesn't match the linked repo is refused with "repo not linked to
   <KEY>", and the refusal is audited.
5. **AC-5** **Who:** the caller must be allowed on that project. A person needs project-scoped
   `delivery:proposal:push`, meaning they are on the project team or are its PM. That permission doesn't
   open 008's unguarded `sync_proposal`. Every write is attributed to the person, or to the credential
   acting for them (rule 4).
6. **AC-6** **What:** a push from the project's default branch (stored with the link) covers every change. A push from another branch
   covers only its own change (`specclaw/<NNN-slug>`). A push never sets `released`, never moves a
   proposal out of `released` or back a phase, and never touches proposals from another source or
   proposals made by hand. Keys stay `<KEY>-<NNN>`. A record
   that breaks a rule is skipped and reported per key; the rest of the batch still applies.
7. **AC-7** **Idempotent and bounded:** a record whose 039 fingerprint matches the stored proposal is
   not written. Re-running the same push returns `unchanged`: no proposal written and no Repo sync row,
   with one audit row that moves the stale marks (product owner's choice in review round 4). A skip a
   person should see sets `needsReview` and is recorded. A call is capped at 200
   records and goes through the 035 per-caller rate limit. Each push stores `sha` and `ref` on the
   proposal's `source_ref`.
8. **AC-8** **Ordering:** a proposal last read at a newer commit (`synced_commit_at`, moved by every
   specclaw writer for every proposal it read, changed or not; `sync_proposal` must send `committedAt`) is skipped as
   `stale`. The plugin sends the commit time with the sha so the server can check this without the
   repo. A commit time in the future is refused. One push is one transaction under the project's row
   lock, so concurrent pushes serialise and a failed push applies nothing.
9. **AC-9** The plugin README documents a Claude Desktop routine that runs `/amax:sync-specclaw --apply`
   on a schedule from the developer's machine. With `--apply`, the plugin applies a preview only when
   amax's `needsReview` is false. Otherwise it applies nothing and reports.
10. **AC-10** The project page shows the Repo sync card from the Mock Delta, read through a new read
    tool `get_repo_sync`. Every row has a `PinButton`. There are no edit controls, only an
    `IntentButton` to link or unlink the repo (rules 1 and 2).
11. **AC-11** Tests cover each refusal: wrong repo, no permission, `released` set, foreign source, stale
    sha, over the cap. They also cover dry-run zero writes and the idempotent re-push. 039's CLI stays
    working as a caller of the same path.

## Tasks

- [x] `T1` — Repo sync card on the project page: linked repo, last sync and who, counts, refused pushes; PinButton per tile and row, IntentButton to link or unlink (AC-10)
  Files: modules/delivery/ui/RepoSyncCard.tsx, modules/delivery/ui/ProjectPage.tsx, modules/delivery/pins.ts
- [x] `T2` — Migration: `delivery.project.repo_url`, and `delivery.sync_push` (project, by, ref, sha, committed_at, counts, refused jsonb, at) (AC-4, AC-8, AC-10)
  Files: modules/delivery/db/migrations/0014_repo_sync.sql
- [x] `T3` — Services `linkProjectRepo` / `unlinkProjectRepo` (PM or Admin, scoped, audited, URL normalised); read `getRepoSync`; MCP tools `link_project_repo`, `unlink_project_repo`, `get_repo_sync` with pins (AC-4, AC-10)
  Files: modules/delivery/server/services.ts, modules/delivery/server/queries.ts, modules/delivery/mcp.ts, modules/delivery/module.ts, modules/delivery/pins.ts
  Depends: T2
- [x] `T4` — `sync_specclaw` MCP tool and `pushSpecclaw`: refuse unknown project and unlinked repo, project-scoped `delivery:proposal:sync` (Engineer@assigned, PM@managed), cap 200, dryRun, per-record skip for released / foreign source / stale sha, 039 fingerprint idempotency, no project creation and no withdrawals, one `sync_push` row per applied call (AC-3, AC-5, AC-6, AC-7, AC-8)
  Files: modules/delivery/sync/import.ts, modules/delivery/server/services.ts, modules/delivery/mcp.ts, modules/delivery/module.ts
  Depends: T3
- [x] `T5` — Tests: each refusal, dry run writes nothing, idempotent re-push, rate limit applies, 039 CLI still syncs (AC-11)
  Files: modules/delivery/tests/sync-push.test.ts, modules/delivery/tests/mcp-registry.test.ts
  Depends: T4
- [x] `T6` — Plugin `plugins/amax/`: plugin.json, `.mcp.json`, repo `.claude-plugin/marketplace.json`, `read-specclaw.mjs` bundled from `modules/delivery/sync/specclaw.ts` (with a drift test), skill `sync-specclaw` (dry run, confirm, `--apply` unattended rule), README with the Claude Desktop routine (AC-1, AC-2, AC-9)
  Files: .claude-plugin/marketplace.json, plugins/amax/.claude-plugin/plugin.json, plugins/amax/.mcp.json, plugins/amax/skills/sync-specclaw/SKILL.md, plugins/amax/scripts/read-specclaw.mjs, plugins/amax/README.md, package.json, pnpm-workspace.yaml, plugins/amax/package.json, plugins/amax/tests/reader.test.ts
  Depends: T4

## Verify

**Verdict:** PASS

- AC-1: pass — `plugins/amax/` (`.claude-plugin/plugin.json`, `.mcp.json` → `${AMAX_MCP_URL:-https://amax.tecbizsolutions.com/api/mcp}`, skill `skills/sync-specclaw/`) is listed in the repo's `.claude-plugin/marketplace.json`. `claude plugin validate plugins/amax` and `claude plugin validate .` both pass. A live `/plugin install` against a deployed amax was not run.
- AC-2: pass — `scripts/read-specclaw.mjs` is bundled (`pnpm build:plugin`) from amax's own `modules/delivery/sync/specclaw.ts`. It reads the project from `amax.project` in `.specclaw/config.yaml` (set to AMX here) or `--project`, takes the remote URL, branch, sha and commit time from git, and refuses uncommitted `.specclaw` edits. On this repo it emits 62 records. `plugins/amax/tests/reader.test.ts` fails if the bundle drifts from the TS reader. The skill previews with `dryRun: true` and applies only on confirm.
- AC-3: pass — `sync_specclaw` (`modules/delivery/mcp.ts`, `delivery:proposal:sync`, `service: null`, so it is never a chat card) runs `pushSpecclaw` in `server/repo-sync.ts`. That reuses 008/039's `syncSpecclaw()` in push mode: dry run, no withdrawals. An unknown project is refused. `syncProposal` is now scoped, and creating a project through it needs `delivery:project:create`. Test: `sync-push.test.ts` "AC-3/AC-5".
- AC-4: pass — migration `0017_repo_sync.sql` adds `delivery.project.repo_url`. `link_project_repo` and `unlink_project_repo` (`delivery:project:link`, PM@managed or Admin, audited, URL normalised) are chat-confirmed through the `delivery.link-repo` intent. A push from another repo, or to a project with no linked repo, is refused, and the refusal is recorded in `delivery.sync_push` as its own audited write. Test: "AC-4".
- AC-5: pass — grants `delivery:proposal:sync@assigned` (Engineer) and `@managed` (PM). A PM is refused on a project they don't manage. Pushes are recorded as the person through MCP and shown as "Claude for <person>". Tests: "AC-3/AC-5", "AC-2/AC-6" (`lastApplied.by` = "Claude for Nimal Silva").
- AC-6: pass — a push skips Released ("released comes from Prod deployments"), skips a step back to an earlier phase ("would move back from building to planned"), and skips keys held by another source or released by hand (KeyTakenError; the dry run reports these too). The rest of the batch applies. Tests: "AC-2/AC-6", "AC-6".
- AC-7: pass — compare-before-write means a re-push of the same state gives 0 writes, 0 audit rows and no `sync_push` row. Records are capped at 200 (zod). The MCP server's existing per-caller rate limit (035, `packages/mcp/src/server.ts`) applies to every tool, including this one; no new test was added for that. Test: "AC-7".
- AC-8: pass — a push whose `committedAt` is older than the last applied push for the same project and branch is refused as `stale`. Another branch is unaffected. Test: "AC-8".
- AC-9: pass — the README documents a local Claude Desktop scheduled task running `/amax:sync-specclaw --apply`. The skill applies unattended only when the preview has no skipped lines. Not run end to end in Claude Desktop.
- AC-10: pass — the project page has a Repo sync card through `get_repo_sync`: linked repo, "N recent pushes were refused", last sync and who, and a table with refused pushes first. Every row has a `PinButton` (`get_sync_push` by id) and the card has one too. There are no inputs; the "Ask amax to link/change the linked repo" button opens chat. Fixtures seed the mock's three CON pushes. e2e: `delivery.spec.ts` "062 AC-10" (content, order, 3 row pins, 0 inputs, axe clean).
- AC-11: pass — `modules/delivery/tests/sync-push.test.ts` (6 tests) covers each refusal (no link, wrong repo, unknown project, not on the project, stale, over 200, Released, step back), dry-run zero writes, and the idempotent re-push. 039's CLI path still passes (`sync-import.test.ts`, `ingest-ac1.test.ts`).

Commands (worktree, local Postgres 16 at `DATABASE_MIGRATE_URL`):
- `pnpm lint` → 0; `pnpm turbo run test lint --concurrency=2 --continue` → 0 (46/46 tasks); `check-module-standard` → 0; `check-graph` → 0
- `pnpm --filter @amax/web build` → 0; `playwright test --config playwright.auth.config.ts` → 80/80; `playwright test` (shell) → 1/1
- `claude plugin validate plugins/amax` → pass; `claude plugin validate .` → pass
- `specclaw-preset-check .` → 1: the repo-wide comment and line-length convention, the same exception as earlier changes. 062 follows the repo's style.
- `specclaw-quality-scan . --gate` → 1, from 4 high-complexity functions: 3 predate 062 (`specclaw.ts` `parse`, `AiSettingsPage`, `BackupTickets`), and the 4th is the generated bundle's copy of `parse`. 062's own `syncSpecclaw` growth was split into `pushRefusal`.
- Quality: 353 → 353 duplicated lines (none in 062's files).

Screenshots: `.specclaw/changes/062-specclaw-sync-plugin/shots/app.png` (the Repo sync card on `/delivery/p/CON`, from the e2e) and `shots/mock.png` (`#062-specclaw-sync-plugin`). Compared by Claude: same facts (linked repo, last sync by "Claude for Kasun Dias" with 3 updated and 14 unchanged, two refused pushes by Nimal and Ayesha with the same reasons, a pin per row, the chat button). The app shows them as one card under the board, without the mock's four tiles; the mock's dry-run panel is the plugin's terminal output, not an amax screen.
- Mock note: `specclaw-screenshot` captures every mock section blank, because the `048-chat-cost` section is never closed and nests every later section (051, 054, 055, 062, …) inside it. That section belongs to 048 and was left unchanged. mock.png was captured by moving 062's section out in the page's DOM only.
Review: skipped. Per-change review is off (`code_review: false`, product owner 2026-10-17).
