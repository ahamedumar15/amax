# Agent governance: suggestions, approval, undo

**Change:** 006-agent-governance · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/agents` · **Depends on:** [002](../002-identity-and-access/change.md), [003](../003-data-core/change.md), [029](../029-workflows-scheduler/change.md), [033](../033-ai-gateway-and-residency/change.md)

## Problem

Agents should never change data on their own. Every agent output (payroll checks, licence removals, access grants, inbox suggestions) needs the same evidence, approval and undo flow, built once.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-payroll`](../../mock/index.html#001-amax-foundation-payroll)

The pattern on Payroll changes (agent chip, Accept/Query), licence savings (Review → Approve removal with undo) and inbox suggestions (Add, Open in chat, Dismiss).

## Acceptance Criteria

1. **AC-1** `core`-backed `agents.suggestion` stores kind, target, proposed change, evidence (links to records, messages, runs), confidence, source and expiry.
2. **AC-2** Suggestions appear where they apply. A person with the right role accepts, queries or dismisses. Only acceptance runs the change, through the module service, and the audit records both the agent and the person. For sensitive kinds (pay, bank files, access grants and revocations, credentials) the approver must be someone other than the person the agent acted for (test).
3. **AC-3** Accepted changes can be undone for 7 days, or until a module-declared cutoff such as a payroll run lock. Undo runs the module's inverse service and is audited. Kinds with external effects that can't be undone (bank files, provider-side revocations) are marked irreversible and need a second approver instead.
4. **AC-4** Agent runs are durable 029 workflows (`waitForEvent` holds a run open while a person decides), with inputs, tool calls, outputs and cost, viewable per suggestion. Run records are masked by sensitivity class and kept per 032. Recurring agent jobs can be switched on and off on Insights.
5. **AC-5** A suggestion that would cross the user's data scope is never shown to them.
6. **AC-6** A run that handles untrusted text (email, Teams, tickets, documents) gets a read-only tool allow-list, and its only output is suggestions validated against their schema. Each suggestion shows its external source. A test feeds an injection message and gets no write tool call.

## Tasks

## Verify
