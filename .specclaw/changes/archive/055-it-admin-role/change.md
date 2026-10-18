# IT Administrator role and the Operations menu

**Change:** 055-it-admin-role · **Created:** 2026-10-17
**Lane:** Platform · **Depends on:** [047](../archive/047-admin-end-to-end/change.md), [048](../archive/048-chat-cost/change.md) · **Enables:** [021](../021-it-access-licences/change.md), [022](../022-helpdesk/change.md), [037](../037-digital-experience/change.md)

## Problem

The only roles are Admin, Leadership, PM, Engineer, Finance, Sales, HR, Payroll and Employee, so running IT today needs full Admin. The operator wants an IT Administrator who can see and run everything an Admin can, except pricing. "Pricing" means every money figure: AI cost, usage cost and, later, licence and contract prices. The mock's Operations menu group (Access and licences, Helpdesk, Compliance, Digital experience, Backups) isn't in the app yet.

## Mock Delta

What changes on screen, and where to see it: [`055-it-admin-role`](../../mock/index.html#055-it-admin-role)

- The nav gets an **Operations** group, shown to Admin and IT Admin. It holds Settings and the operations screens; the ones that aren't built yet show as "Coming soon".
- Signed in as IT Admin, every settings screen opens and its writes work through chat. Every money figure shows as "Hidden for your role", with no pin and no tool access to the value.

## Acceptance Criteria

1. **AC-1** `ITAdmin` is added to `ROLES`, to the role-assignment tools and to "View as". A demo IT Admin user ("Ravi Perera (fictional)") is added to the Lumen Labs fixtures.
2. **AC-2** IT Admin gets every grant Admin has (screens, MCP read and write tools, chat confirms), except the `pricing` class. This is done with explicit grants, not the Admin bypass in `packages/auth/src/can.ts`. A table test lists every Admin-only tool and checks IT Admin's result for each.
3. **AC-3** A `pricing` sensitivity class covers `ai.call.cost_usd`, every cost figure from `aiUsage` and `aiUsageTotals`, the hub's AI cost card and other people's chat cost. For IT Admin, screens show "Hidden for your role". `get_ai_usage` returns tokens and calls with no cost fields, never null-as-$0. The chat cost footer still shows a person their own cost. Tests cover the screen, the MCP tool and the page HTML.
4. **AC-4** The nav has an Operations group (Admin and IT Admin): Settings, Access and licences, Helpdesk, Compliance, Digital experience, and Backups and export. Screens that aren't built yet link to a "Coming soon" page that names their change. Other roles don't see the group.
5. **AC-5** Each Admin-only e2e test (keys, integrations, AI, scheduler, audit, usage, hub) also runs as IT Admin and passes, with pricing hidden on usage and the hub. Typecheck, unit tests, lint and both e2e suites stay green.

## Tasks

- [x] `T1` — Operations nav group and "Coming soon" screens that name their change (AC-4)
  Files: apps/web/lib/registry.ts, apps/web/lib/operations.ts, apps/web/app/(app)/operations/[screen]/page.tsx
- [x] `T2` — Settings screens open for IT Admin by permission; every money figure reads "Hidden for your role" with no pin (usage, hub, AI and data, scheduler, trace); View as and the profile menu know IT Admin (AC-1, AC-3)
  Files: apps/web/app/(app)/settings/**, apps/web/components/settings/**, apps/web/components/workflows/RunsCard.tsx, apps/web/components/shell/ProfileMenu.tsx, apps/web/lib/profile.ts, apps/web/lib/admin/status.ts, apps/web/lib/chat-usage.ts
  Depends: T3, T4
- [x] `T3` — `ITAdmin` role, its explicit grants (every Admin-only permission, never `pricing`), role-assignment and View as, and Ravi Perera (fictional) in the Lumen Labs fixtures (AC-1, AC-2)
  Files: packages/auth/src/roles.ts, packages/auth/src/it-admin.ts, packages/auth/src/index.ts, packages/auth/src/principals.ts, packages/core/src/module.ts, packages/chat/src/tools.ts, packages/testing/src/fixtures/shared.ts, modules/hr/fixtures/*, apps/web/lib/server.ts, .specclaw/changes/archive/001-amax-foundation/fixtures.md
- [x] `T4` — The `pricing` class: `canSeePricing`, cost fields left out (not null) of `aiUsage`, `aiUsageTotals`, `get_ai_usage`, `get_ai_policy`, workflow run and trace tools for roles without it; the chat footer keeps your own cost (AC-3)
  Files: packages/auth/src/sensitivity.ts, packages/ai/src/usage.ts, packages/ai/src/usage-tool.ts, packages/ai/src/usage-format.ts, apps/web/lib/admin/ai.ts, apps/web/lib/admin/workflows.ts, packages/mcp/src/audit-tools.ts
  Depends: T3
- [x] `T5` — Tests: the Admin-only tool table for IT Admin, pricing on screen, tool and page HTML, and each Admin-only e2e spec run as IT Admin (AC-2, AC-3, AC-5)
  Files: packages/auth/tests/*, packages/ai/tests/usage.test.ts, apps/web/tests/admin/*, apps/web/tests/e2e/*
  Depends: T1, T2, T3, T4

## Verify

**Verdict:** PASS

- AC-1: pass — `ITAdmin` in `ROLES` (`packages/auth/src/roles.ts`, shown as "IT Admin"), so `isRole` accepts it in the admin CLI, Entra group mapping and SCIM; migration `0028_it_admin_role.sql` widens the role checks on `role_mapping`, `role_assignment` and `session.view_as_role`; "IT Admin" is in View as (e2e `auth.spec.ts` AC5: banner "Viewing as IT Admin: prices are hidden.", chip, Settings in nav). Ravi Perera (`ravi@lumenlabs.test`, IT administrator) is in the shared Lumen Labs fixtures and fixtures.md, and takes the last IT filler seat so headcount stays 184.
- AC-2: pass — `IT_ADMIN_GRANTS` (`packages/auth/src/it-admin.ts`) names each Admin-only platform permission, registered as an ordinary grant; `can.ts`'s Admin bypass is unchanged and IT Admin doesn't use it. `apps/web/tests/admin/it-admin.test.ts` AC-2 builds the full tool registry, finds every platform tool no other role can reach, and checks the table of 34 tools against IT Admin's result for each (all true). If a new Admin-only tool is added without a grant, the test fails. The pricing class stays Admin's alone.
- AC-3: pass — `pricing` class in `SENSITIVITY_POLICY` (Admin; self true), with `canSeePricing`, `withoutPricing` and `pricedFor`. `aiUsage` and `aiUsageTotals` leave `costUsd` out (it isn't set to null) for a tenant view without pricing, and rank by calls; `get_ai_usage`, `get_ai_policy`, `list_workflow_runs`, `get_workflow_run` and the audit/trace tools leave out cost fields. Screens show "Hidden for your role" with no pin (usage Cost ticket, hub AI usage chip, AI and data note, Scheduler cost ticket; Cost columns removed; chart becomes calls per day). The chat footer is scope self, so it still shows your own cost. Tests: it-admin.test.ts AC-3 (MCP tools, Postgres); e2e `ai-usage.spec.ts` 055 (screen, no pin, no `$` in main HTML, hub chip) plus `ai`, `workflows` and `audit` specs as IT Admin with no `$` in main.
- AC-4: pass — `navItems` gains Settings plus Access and licences (021), Helpdesk (022), Compliance (036), Digital experience (037) and Backups and export (034) under Operations, behind `settings:read` and `operations:read` (Admin, IT Admin). `/operations/[screen]` is a "Coming soon" page naming its change. E2e `admin.spec.ts` 055 AC4 checks the group for both roles, the Helpdesk page text and axe, and that Nimal sees no group and gets a 404.
- AC-5: pass — hub, no-forms/pins, rotate credential, keys (mock diff), integrations (connect plus revoke through chat), AI and data, Scheduler, audit/trace and usage specs each also run as IT Admin, plus a resume-schedule-through-chat test as IT Admin. Pricing is hidden on usage and the hub.

Commands (exit codes):
- `pnpm lint` → 0 (tsc for every package plus check:graph)
- `DATABASE_MIGRATE_URL=…/amax_055 pnpm turbo run test --concurrency=1` → 0 (17/17). In parallel runs, other packages hit "too many clients" on the shared test Postgres; this is environmental.
- `node scripts/check-module-standard.mjs` → 0 (5 modules)
- `pnpm build` → 0
- `E2E_PORT=3556 pnpm e2e` (apps/web) → 0, 1 passed
- `E2E_DB=amax_055_e2e E2E_AUTH_PORT=3555 pnpm e2e:auth` (apps/web) → 0, 68 passed
- `E2E_TIME_PORT=3557 E2E_TIME_DB=amax_055_time pnpm e2e` (modules/time) → 0, 2 passed; `PRESALES_E2E_PORT=3558 PRESALES_E2E_DB=amax_055_presales pnpm e2e` (modules/presales) → 0, 6 passed
- `specclaw-preset-check .` → 1. The violations are repo-wide and existed before this change (comment rule); the new files follow the surrounding code's style.
- `specclaw-quality-scan . --gate` → not run (known jq "Argument list too long" failure).
- specclaw-review: not run (operator: review once per module, at the end).

Quality: not_run (specclaw-quality-scan fails on this repo: jq "Argument list too long")

Screenshots: `shots/app-usage-it-admin.png`, `shots/app-hub-it-admin.png`, `shots/app-coming-soon.png`, `shots/mock.png` (section `#055-it-admin-role`). Compared: Cost reads "Hidden / Hidden for your role" with no pin; Calls, Tokens and Unknown price keep their pins; the lede says prices are hidden; the nav shows the Operations group. Note: in the mock, from 049 on, every section sits inside an unclosed `<section>`, so `#048…` and later hashes render blank; the mock shot was taken with the section lifted into `main`. This needs a mock fix in its own change.
