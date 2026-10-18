# Compliance: policies, registers, audit integrity and evidence

**Change:** 036-compliance-registers · **Created:** 2026-10-17
**Lane:** IT · **Module:** `modules/compliance` · **Depends on:** [002](../002-identity-and-access/change.md), [003](../003-data-core/change.md), [011](../011-hr-core/change.md) · **Integrates with (optional):** [021](../021-it-access-licences/change.md), [024](../024-learning/change.md), [033](../033-ai-gateway-and-residency/change.md)

## Problem

The roadmap says amax supports ISO 27001 and SOC 2 audits, but nothing tracks policy acknowledgements, risks, incidents or suppliers, and nothing proves the audit log has not been changed (architecture review F13, roadmap §10).

## Mock Delta

What changes on screen, and where to see it: [`036-compliance-registers`](../../mock/index.html#036-compliance-registers)

New screen, Compliance: policy acknowledgement rates, open risks and incidents (with notification deadlines), the supplier list, the audit-chain check, and evidence export per control.

## Acceptance Criteria

1. **AC-1** `compliance` schema: versioned policies with read-and-acknowledge per person, a risk register, an incident register and a supplier register. A new policy version asks everyone in scope to acknowledge it again.
2. **AC-2** An incident flagged as a personal-data breach starts a notification deadline from its country pack, shown on the incident, with 030 reminders to the owner.
3. **AC-3** The supplier register includes every subprocessor, including the AI providers configured in 033.
4. **AC-4** A daily job verifies the 003 audit hash chain and shows the last verified point. A test changes one audit row and verification fails, naming the row.
5. **AC-5** Evidence export per control (access reviews from 021, training completion from 024, policy acknowledgements, incidents, audit-chain checks) produces a dated, signed bundle.
6. **AC-6** Chat intents "report incident" and "new risk". The Compliance screen matches the mock within a 2% visual diff.
7. **AC-7** The module meets `docs/module-standard.md`: it changes nothing outside `modules/<name>/` (apart from its CODEOWNERS line); its `contracts.ts` is published first and has contract tests; it has a README, fixtures and a manifest; it can be switched off; and every optional integration degrades gracefully when the other module isn't installed.

## Tasks

- [ ] `T1` — Compliance screen matching the mock, on a published `contracts.ts` (AC-6, AC-7)
  Files: modules/compliance/package.json, modules/compliance/tsconfig.json, modules/compliance/css.d.ts, modules/compliance/module.ts, modules/compliance/contracts.ts, modules/compliance/ui/CompliancePage.tsx, modules/compliance/ui/Tickets.tsx, modules/compliance/ui/Incidents.tsx, modules/compliance/ui/Registers.tsx, modules/compliance/ui/AskButton.tsx, modules/compliance/ui/art.ts, modules/compliance/ui/parts.tsx, modules/compliance/ui/prompts.ts, modules/compliance/ui/compliance.css, apps/web/lib/registry.ts
- [ ] `T2` — `compliance` schema with RLS, breach country packs and fictional fixtures (AC-1, AC-2, AC-3)
  Files: modules/compliance/db/migrations/0001_compliance.sql, modules/compliance/packs.ts, modules/compliance/fixtures/index.ts
  Depends: T1
- [ ] `T3` — Services and MCP tools: versioned policies and acknowledgements, risks, incidents with breach deadlines, suppliers including the 033 AI providers (AC-1, AC-2, AC-3)
  Files: modules/compliance/server/context.ts, modules/compliance/server/rows.ts, modules/compliance/server/policies.ts, modules/compliance/server/risks.ts, modules/compliance/server/incidents.ts, modules/compliance/server/suppliers.ts, modules/compliance/server/overview.ts, modules/compliance/mcp.ts
  Depends: T2
- [ ] `T4` — Daily audit-chain check, breach deadline reminders through 030, and signed evidence bundles per control (AC-2, AC-4, AC-5)
  Files: modules/compliance/server/chain.ts, modules/compliance/server/evidence.ts, modules/compliance/server/reminders.ts, modules/compliance/module.ts, modules/compliance/mcp.ts
  Depends: T3
- [ ] `T5` — Chat intents "report incident" and "new risk", retention entries, README and CODEOWNERS (AC-6, AC-7)
  Files: modules/compliance/chat.ts, modules/compliance/module.ts, modules/compliance/README.md, .github/CODEOWNERS
  Depends: T4
- [ ] `T6` — Tests: contracts, services and permissions, chain tamper, chat-first, module standard with and without optional modules, e2e with axe and the mock visual diff (AC-1 to AC-7)
  Files: modules/compliance/tests/db.ts, modules/compliance/tests/installed.ts, modules/compliance/tests/contracts.test.ts, modules/compliance/tests/registers.test.ts, modules/compliance/tests/chain.test.ts, modules/compliance/tests/chat-first.test.ts, modules/compliance/tests/standard.test.ts, modules/compliance/tests/e2e/playwright.config.ts, modules/compliance/tests/e2e/setup.ts, modules/compliance/tests/e2e/css-hook.mjs, modules/compliance/tests/e2e/compliance.spec.ts, apps/web/tests/e2e/admin.spec.ts
  Depends: T5

## Verify
