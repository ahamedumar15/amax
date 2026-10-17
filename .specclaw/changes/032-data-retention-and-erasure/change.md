# Data retention, erasure and access requests

**Change:** 032-data-retention-and-erasure · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/privacy` · **Depends on:** [002](../002-identity-and-access/change.md), [003](../003-data-core/change.md), [029](../029-workflows-scheduler/change.md) · **Integrates with (optional):** [006](../006-agent-governance/change.md)

## Problem

No proposal says how long anything is kept. HR files, payslips, medical leave, candidates, inbox excerpts, chat and agent run logs would grow forever, and there is no way to answer an access or erasure request under Sri Lanka's PDPA or Australia's Privacy Act (architecture review F10).

## Mock Delta

What changes on screen, and where to see it: [`032-data-retention-and-erasure`](../../mock/index.html#032-data-retention-and-erasure)

New screen, Data retention: retention by data class and entity, the next purge, legal holds, and the queue of access and erasure requests with their approval state.

## Acceptance Criteria

1. **AC-1** Modules declare retention in their manifest for every table that holds personal data: data class (002 sensitivity classes), period, start trigger (such as `hr.person.left` or a candidate decision) and action (delete or anonymise). The module-standard check fails a module whose personal-data tables have no entry.
2. **AC-2** Country packs set statutory minimum periods per legal entity. A tenant can lengthen a period but never shorten it below the minimum. Tenant defaults ship for the rest: candidates 12 months after the decision, inbox excerpts 30 days, chat 90 days, agent run logs 180 days.
3. **AC-3** A daily 029 workflow deletes or anonymises due records through each module's service. It is audited by class and count, never by value. A legal hold on a person or matter pauses it, and a test shows held records survive.
4. **AC-4** HR opens an access or erasure request for a person. amax lists the person's records in every module, then exports a data package (access) or erases and anonymises (erasure). Records a statutory minimum still requires are kept and listed with the reason. Completing a request needs a second approver through 006.
5. **AC-5** Erasure removes personal values from audit payloads and run records while the audit hash chain stays verifiable. A test erases a person and then verifies the chain.
6. **AC-6** The Data retention screen matches the mock within a 2% visual diff and is visible to Admin and HR only.

## Tasks

- [ ] `T1` — Data retention screen at /settings/retention and its live hub card: tickets, retention by data class and entity, requests, purged last 30 days; read-only with "Ask amax" chips and pins; Admin and HR only (AC-6)
  Files: apps/web/app/(app)/settings/retention/page.tsx, apps/web/app/(app)/settings/retention/RetentionTable.tsx, apps/web/app/(app)/settings/retention/RequestsCard.tsx, apps/web/app/(app)/settings/retention/format.ts, apps/web/app/(app)/settings/retention/retention.css, apps/web/app/(app)/settings/page.tsx, apps/web/lib/admin/status.ts
- [x] `T2` — Retention declarations: RetentionEntry gains label, subject and entity columns; every personal-data table in modules and platform packages has an entry (chat 90 days, agent run logs 180 days); the module-standard check fails a module whose personal-data tables have none (AC-1, AC-2)
  Files: packages/core/src/module.ts, scripts/check-module-standard.mjs, packages/testing/standard/no-retention/**, packages/testing/tests/ac7-config.test.ts, modules/*/module.ts, packages/chat/src/tools.ts, packages/workflows/src/retention.ts
- [x] `T3` — Privacy schema (migration 0024): retention overrides, legal holds, requests, purge log; an amax_privacy role holds EXECUTE on core.erase_subject, reached only through a definer function that erases an approved request's subjects (AC-3, AC-4, AC-5)
  Files: packages/db/migrations/0024_privacy.sql
- [x] `T4` — Privacy services in core: statutory minimums per country, tenant defaults, effective periods, lengthen-only overrides, legal holds, the purge (audited by class and count), access and erasure requests with a two-person rule behind one replaceable seam (AC-2, AC-3, AC-4, AC-5)
  Files: packages/core/src/privacy.ts, packages/core/src/privacy/*.ts, packages/core/tests/privacy*.test.ts
  Depends: T2, T3
- [ ] `T5` — Integration: MCP read and write tools behind chat's confirm, the daily 029 purge workflow replacing workflows.prune, grants for HR, demo fixtures and the scripted chat phrases; tool, e2e, a11y and visual tests (AC-3, AC-4, AC-6)
  Files: apps/web/lib/admin/privacy.ts, apps/web/lib/admin/index.ts, apps/web/lib/platform-workflows.ts, apps/web/lib/server.ts, apps/web/scripts/seed-demo.ts, packages/ai/src/scripted.ts, apps/web/tests/admin/privacy.test.ts, apps/web/tests/e2e/retention.spec.ts, apps/web/playwright.auth.config.ts, apps/web/playwright.config.ts, docs/architecture.md
  Depends: T1, T4

## Verify
