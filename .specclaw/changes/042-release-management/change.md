# Delivery: release management — environments, tags and corrections

**Change:** 042-release-management · **Created:** 2026-10-17
**Lane:** Delivery · **Module:** `modules/delivery` · **Depends on:** [007](../007-delivery-projects/change.md) · **Integrates with (optional):** [004](../004-mcp-gateway/change.md), [005](../005-amax-chat/change.md)

## Problem

007 hard-codes four tenant-wide environments (Dev, QA, UAT, Prod) and only lets a release move forward one step. Real projects differ: some deploy only to Dev, some have Staging, and people need to fix a wrong record or re-tag a release. Today none of that is possible from the UI or MCP.

## Mock Delta

Small additions to [`001-amax-foundation-releases`](../../mock/index.html#001-amax-foundation-releases): an Environments panel on the project page, and Edit on a release row. To be drawn in the mock first.

## Acceptance Criteria

1. **AC-1** Environments are per project: add, rename, reorder and remove (when unused), and mark exactly one as Prod or none (a project can live in Dev only). Existing projects get Dev, QA, UAT, Prod.
2. **AC-2** Releases can be created, renamed (tag), have proposals added or removed, and be deployed to **any** environment of the project, not only the next one. "Released" still means the project's Prod environment.
3. **AC-3** A deployment can be corrected or voided with a reason. Corrections are audited and the release map recomputes; a proposal leaves `released` if its only Prod deployment is voided.
4. **AC-4** MCP tools: `list_environments`, `upsert_environment`, `create_release`, `tag_release`, `set_release_proposals`, `record_deployment` (any environment), `void_deployment`, same permissions as the screens (PM on the project, or Admin). Chat intents for "deploy v2.4.0 of Contoso to UAT" and "tag CON-014 into v2.5.0".
5. **AC-5** Pipelines can report deployments by environment name through the same service (008 later adds signed webhooks).

## Tasks

Assumptions (Rule 1):
- Built on the 005 stack (#22): the MCP registry and chat confirm cards give AC-4's tools and intents for free.
- The mock isn't redrawn first (the proposal asked for it); the new controls reuse the mock's card, table and form styles and are listed for 041's parity pass.
- The data migration copies the tenant-wide Dev/QA/UAT/Prod to every project and repoints deployments by name. It lifts FORCE RLS on the two tables for its own transaction so it also runs where the schema owner isn't a superuser.
- Voiding keeps the row (with who, when and why) and every read ignores voided rows, so the map recomputes and history stays.

- [x] `T1` — Migration (per-project environments, at most one Prod, void columns); services: `upsertEnvironment`, `removeEnvironment`, `tagRelease`, `setReleaseProposals`, `recordDeployment` to any environment of the project, `voidDeployment` (un-releases when the only Prod deployment goes); new projects get default environments; queries per project (AC-1, AC-2, AC-3, AC-5)
  Kind: impl
  Files: modules/delivery/db/migrations/0002_release_management.sql, modules/delivery/server/{services,queries}.ts, modules/delivery/fixtures/index.ts, modules/delivery/tests/releases.test.ts
- [x] `T2` — MCP tools and chat intents: `list_environments`, `upsert_environment`, `tag_release`, `set_release_proposals`, `void_deployment` (+ existing `create_release`, `record_deployment`); "deploy … to UAT", "tag … into v2.5.0" (AC-4)
  Kind: impl
  Files: modules/delivery/{mcp,chat}.ts
  Depends: T1
- [x] `T3` — UI: Environments card on the project page; release page (rename tag, choose proposals, deploy to any environment with status and note, deployment history with Void and a reason); releases table links and per-project columns; e2e (AC-1, AC-2, AC-3)
  Kind: impl
  Files: modules/delivery/ui/{ProjectPage,ReleasesPage,ReleasePage,EnvironmentsCard}.tsx, modules/delivery/actions.ts, modules/delivery/module.ts, apps/web/tests/e2e/releases.spec.ts
  Depends: T2

## Verify

**Verdict:** PASS
- AC-1: pass — `releases.test.ts` + e2e: environments per project (migration copies Dev/QA/UAT/Prod to each and repoints deployments); add, rename, reorder, mark exactly one Prod or none, remove only when unused; new projects get the defaults; the Environments card on the project page.
- AC-2: pass — releases re-tagged and their proposals set (UI release page, MCP `tag_release` / `set_release_proposals`); deploy to any environment by name, including straight to Prod; a project without Prod never releases.
- AC-3: pass — voiding keeps the row with reason and who (history shows "Voided: …"), reads ignore it so the map recomputes, and voiding the only Prod deployment returns its proposals to Verified with `phase_changed` events; audited.
- AC-4: pass — MCP tools `list_environments`, `get_release_history`, `upsert_environment`, `remove_environment`, `tag_release`, `set_release_proposals`, `void_deployment`, `create_release`, `record_deployment`, same permissions as the screens (PM on the project, or Admin); chat intents "Record a deployment" and "Change a release" (write tools go through the 005 confirm card).
- AC-5: pass — pipelines report by environment name through `record_deployment` (case-insensitive).

Not done: the mock wasn't redrawn first; the new controls use existing mock styles and are queued for 041's parity pass.
Commands: `pnpm test`, `pnpm lint`, `pnpm build`, `e2e`, `e2e:auth` (25 flows).
