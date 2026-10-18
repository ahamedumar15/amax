# amax Claude plugin: specclaw sync

**Change:** 062-specclaw-sync-plugin · **Created:** 2026-10-18
**Lane:** Delivery · **Module:** `modules/delivery` + `plugins/amax` · **Depends on:** [039](../archive/039-specclaw-self-sync/change.md), [044](../archive/044-release-and-region-hardening/change.md), [004](../004-mcp-gateway/change.md)
**Takes over:** 008 AC-1 (`sync_proposal` for specclaw) and AC-7. 008 keeps the webhook, time and deployment criteria.

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
   `delivery:proposal:sync`) takes `{ projectKey, repoUrl, sha, ref, records[], dryRun }`. It calls the
   existing `syncProposal` service for each changed record. The tool does not create projects. An
   unknown `projectKey` is refused.
4. **AC-4** **Repo binding:** a project syncs only from its linked repo. The write tools
   `link_project_repo` and `unlink_project_repo` are for PM or Admin and go through the chat confirm.
   A push whose normalised `repoUrl` doesn't match the linked repo is refused with "repo not linked to
   <KEY>", and the refusal is audited.
5. **AC-5** **Who:** the caller must be allowed on that project. A person needs project-scoped
   `delivery:proposal:sync`, meaning they are on the project team or are its PM. A service principal
   needs that permission plus the project in its scope. Every write is attributed "Claude for
   <person>" or to the principal (rule 4).
6. **AC-6** **What:** a push never sets `released`, never moves a proposal out of `released`, and never
   touches proposals from another source or proposals made by hand. Keys stay `<KEY>-<NNN>`. A record
   that breaks a rule is skipped and reported per key; the rest of the batch still applies.
7. **AC-7** **Idempotent and bounded:** a record whose 039 fingerprint matches the stored proposal is
   not written. Re-running the same push gives 0 writes and no audit noise. A call is capped at 200
   records and goes through the 035 per-caller rate limit. Each push stores `sha` and `ref` on the
   proposal's `source_ref`.
8. **AC-8** **Ordering:** a push with an older `sha` for the same `ref` than the one stored for a
   proposal is skipped as `stale`. The plugin sends commit time with the sha so the server can check
   this without the repo.
9. **AC-9** The plugin README documents a Claude Desktop routine that runs `/amax:sync-specclaw --apply`
   on a schedule from the developer's machine. With `--apply` and no TTY, the plugin applies only after
   a dry run that has no refusals. If the dry run has refusals, it applies nothing and reports.
10. **AC-10** The project page shows the Repo sync card from the Mock Delta, read through a new read
    tool `get_repo_sync`. Every row has a `PinButton`. There are no edit controls, only an
    `IntentButton` to link or unlink the repo (rules 1 and 2).
11. **AC-11** Tests cover each refusal: wrong repo, no permission, `released` set, foreign source, stale
    sha, over the cap. They also cover dry-run zero writes and the idempotent re-push. 039's CLI stays
    working as a caller of the same path.

## Tasks

- [ ] `T1` — Repo sync card on the project page: linked repo, last sync and who, counts, refused pushes; PinButton per tile and row, IntentButton to link or unlink (AC-10)
  Files: modules/delivery/ui/RepoSyncCard.tsx, modules/delivery/ui/ProjectPage.tsx, modules/delivery/pins.ts
- [ ] `T2` — Migration: `delivery.project.repo_url`, and `delivery.sync_push` (project, by, ref, sha, committed_at, counts, refused jsonb, at) (AC-4, AC-8, AC-10)
  Files: modules/delivery/db/migrations/0014_repo_sync.sql
- [ ] `T3` — Services `linkProjectRepo` / `unlinkProjectRepo` (PM or Admin, scoped, audited, URL normalised); read `getRepoSync`; MCP tools `link_project_repo`, `unlink_project_repo`, `get_repo_sync` with pins (AC-4, AC-10)
  Files: modules/delivery/server/services.ts, modules/delivery/server/queries.ts, modules/delivery/mcp.ts, modules/delivery/module.ts, modules/delivery/pins.ts
  Depends: T2
- [ ] `T4` — `sync_specclaw` MCP tool and `pushSpecclaw`: refuse unknown project and unlinked repo, project-scoped `delivery:proposal:sync` (Engineer@assigned, PM@managed), cap 200, dryRun, per-record skip for released / foreign source / stale sha, 039 fingerprint idempotency, no project creation and no withdrawals, one `sync_push` row per applied call (AC-3, AC-5, AC-6, AC-7, AC-8)
  Files: modules/delivery/sync/import.ts, modules/delivery/server/services.ts, modules/delivery/mcp.ts, modules/delivery/module.ts
  Depends: T3
- [ ] `T5` — Tests: each refusal, dry run writes nothing, idempotent re-push, rate limit applies, 039 CLI still syncs (AC-11)
  Files: modules/delivery/tests/sync-push.test.ts, modules/delivery/tests/mcp-registry.test.ts
  Depends: T4
- [ ] `T6` — Plugin `plugins/amax/`: plugin.json, `.mcp.json`, repo `.claude-plugin/marketplace.json`, `read-specclaw.mjs` bundled from `modules/delivery/sync/specclaw.ts` (with a drift test), skill `sync-specclaw` (dry run, confirm, `--apply` unattended rule), README with the Claude Desktop routine (AC-1, AC-2, AC-9)
  Files: .claude-plugin/marketplace.json, plugins/amax/.claude-plugin/plugin.json, plugins/amax/.mcp.json, plugins/amax/skills/sync-specclaw/SKILL.md, plugins/amax/scripts/read-specclaw.mjs, plugins/amax/README.md, modules/delivery/package.json, modules/delivery/tests/plugin-reader.test.ts
  Depends: T4

## Verify
