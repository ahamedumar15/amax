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

- [ ] `T1` — Operations nav group and "Coming soon" screens that name their change (AC-4)
  Files: apps/web/lib/registry.ts, apps/web/lib/operations.ts, apps/web/app/(app)/operations/[screen]/page.tsx
- [ ] `T2` — Settings screens open for IT Admin by permission; every money figure reads "Hidden for your role" with no pin (usage, hub, AI and data, scheduler, trace); View as and the profile menu know IT Admin (AC-1, AC-3)
  Files: apps/web/app/(app)/settings/**, apps/web/components/settings/**, apps/web/components/workflows/RunsCard.tsx, apps/web/components/shell/ProfileMenu.tsx, apps/web/lib/profile.ts, apps/web/lib/admin/status.ts, apps/web/lib/chat-usage.ts
  Depends: T3, T4
- [ ] `T3` — `ITAdmin` role, its explicit grants (every Admin-only permission, never `pricing`), role-assignment and View as, and Ravi Perera (fictional) in the Lumen Labs fixtures (AC-1, AC-2)
  Files: packages/auth/src/roles.ts, packages/auth/src/it-admin.ts, packages/auth/src/index.ts, packages/auth/src/principals.ts, packages/core/src/module.ts, packages/chat/src/tools.ts, packages/testing/src/fixtures/shared.ts, modules/hr/fixtures/*, apps/web/lib/server.ts, .specclaw/changes/archive/001-amax-foundation/fixtures.md
- [ ] `T4` — The `pricing` class: `canSeePricing`, cost fields left out (not null) of `aiUsage`, `aiUsageTotals`, `get_ai_usage`, `get_ai_policy`, workflow run and trace tools for roles without it; the chat footer keeps your own cost (AC-3)
  Files: packages/auth/src/sensitivity.ts, packages/ai/src/usage.ts, packages/ai/src/usage-tool.ts, packages/ai/src/usage-format.ts, apps/web/lib/admin/ai.ts, apps/web/lib/admin/workflows.ts, packages/mcp/src/audit-tools.ts
  Depends: T3
- [ ] `T5` — Tests: the Admin-only tool table for IT Admin, pricing on screen, tool and page HTML, and each Admin-only e2e spec run as IT Admin (AC-2, AC-3, AC-5)
  Files: packages/auth/tests/*, packages/ai/tests/usage.test.ts, apps/web/tests/admin/*, apps/web/tests/e2e/*
  Depends: T1, T2, T3, T4

## Verify
