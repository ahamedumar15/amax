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

## Verify
