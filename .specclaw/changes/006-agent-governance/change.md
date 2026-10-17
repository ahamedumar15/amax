# Agent governance: suggestions, approval, undo

**Change:** 006-agent-governance · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/agents` · **Depends on:** [002](../002-identity-and-access/change.md), [003](../003-data-core/change.md)

## Problem

Agents should never change data on their own. Every agent output (payroll checks, licence removals, access grants, inbox suggestions) needs the same evidence, approval and undo flow, built once.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-payroll`](../../mock/index.html#001-amax-foundation-payroll)

The pattern on Payroll changes (agent chip, Accept/Query), licence savings (Review → Approve removal with undo) and inbox suggestions (Add, Open in chat, Dismiss).

## Acceptance Criteria

1. **AC-1** `core`-backed `agents.suggestion` stores kind, target, proposed change, evidence (links to records, messages, runs), confidence, source and expiry.
2. **AC-2** Suggestions appear where they apply. A person with the right role accepts, queries or dismisses. Only acceptance runs the change, through the module service, and the audit records both the agent and the person.
3. **AC-3** Accepted changes can be undone for 7 days, or until a module-declared cutoff such as a payroll run lock. Undo runs the module's inverse service and is audited.
4. **AC-4** Agent runs are jobs (`agents.run`) with inputs, tool calls, outputs and cost, viewable per suggestion. Recurring agent jobs can be switched on and off on Insights.
5. **AC-5** A suggestion that would cross the user's data scope is never shown to them.

## Tasks

## Verify
