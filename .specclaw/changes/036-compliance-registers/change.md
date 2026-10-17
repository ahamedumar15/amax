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

## Verify
