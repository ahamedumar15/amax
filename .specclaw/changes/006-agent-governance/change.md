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

- [x] `T1` — Mock section: the Suggestions screen (needs your decision, second approvals, undo window, run detail, agent jobs) with Ask amax and pins (AC-2, AC-3, AC-4, AC-5, AC-6)
  Files: .specclaw/mock/index.html
- [ ] `T2` — Suggestions screen and nav entry matching the mock, chat-first (Ask amax to accept, query, dismiss, undo; pins on every card), plus a suggestions card on Allocations where they apply (AC-2, AC-3, AC-4, AC-5, AC-6)
  Files: apps/web/app/(app)/suggestions/page.tsx, apps/web/app/(app)/suggestions/suggestions.css, apps/web/components/agents/SuggestionCard.tsx, apps/web/components/agents/AgentJobsCard.tsx, apps/web/lib/registry.ts, modules/allocations/ui/AllocationsPage.tsx, modules/allocations/ui/Suggestions.tsx, apps/web/tests/e2e/suggestions.spec.ts
  Depends: T1, T3, T4, T5, T6, T7
- [x] `T3` — `agents.suggestion` store: migration with RLS, suggestion kinds (`defineSuggestionKind`, schema-validated proposed change), create service with kind, target, proposed change, evidence, confidence, source and expiry; retention entry; manifest slot for kinds (AC-1, AC-6)
  Files: packages/db/migrations/0029_agents.sql, packages/agents/package.json, packages/agents/src/index.ts, packages/agents/src/kinds.ts, packages/agents/src/store.ts, packages/agents/src/module.ts, packages/core/src/module.ts, packages/agents/tests/setup.ts, packages/agents/tests/ac1-store.test.ts
- [x] `T4` — Decisions: accept, query, dismiss; only acceptance runs the kind's module service; audit names agent and person; sensitive kinds need an approver other than the person acted for; irreversible kinds need a second approver; undo for 7 days or until the kind's cutoff through its inverse service (AC-2, AC-3)
  Files: packages/agents/src/decide.ts, packages/agents/src/undo.ts, packages/agents/tests/ac2-decide.test.ts, packages/agents/tests/ac3-undo.test.ts
  Depends: T3
- [x] `T5` — Reads filtered by the viewer's data scope and masked by class; a suggestion outside the scope is never listed or resolved (AC-5)
  Files: packages/agents/src/read.ts, packages/agents/tests/ac5-scope.test.ts
  Depends: T3
- [x] `T6` — Agent runs as a durable 029 workflow (think step with tool calls and cost, suggest step, `waitForEvent` per suggestion), run view per suggestion masked by class; read-only tool allow-list, output only schema-valid suggestions with their external source; injection test (AC-4, AC-6)
  Files: packages/agents/src/run.ts, packages/ai/src/gateway.ts, packages/agents/tests/ac4-run.test.ts, packages/agents/tests/ac6-injection.test.ts
  Depends: T3, T4
- [x] `T7` — Real kinds: allocations rebalance (reversible, cutoff at the month's start) with its recurring agent check (off by default), and service-credential revocation (sensitive, irreversible) (AC-2, AC-3, AC-4)
  Files: modules/allocations/suggestions.ts, modules/allocations/module.ts, modules/allocations/tests/suggestions.test.ts, packages/agents/src/kinds/credential.ts
  Depends: T4, T6
- [ ] `T8` — Wiring: MCP tools (list, get, run, create, and chat-only accept, query, dismiss, undo), grants, privacy sources, workflows registry, demo fixtures, docs (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6)
  Files: packages/agents/src/mcp.ts, packages/agents/src/fixtures.ts, packages/agents/README.md, apps/web/lib/server.ts, apps/web/lib/privacy-sources.ts, apps/web/scripts/seed-demo.ts, apps/web/tests/agents-tools.test.ts, docs/architecture.md
  Depends: T3, T4, T5, T6, T7
- [ ] `T9` — Full gates: typecheck, unit tests, lint, module-standard check, build, guest and signed-in e2e, screenshots
  Files: .specclaw/changes/006-agent-governance/change.md
  Depends: T1, T2, T3, T4, T5, T6, T7, T8

## Verify
