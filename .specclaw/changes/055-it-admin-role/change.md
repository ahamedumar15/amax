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

## Verify
