# Immutable trace and audit viewer

**Change:** 050-immutable-trace · **Created:** 2026-10-17
**Lane:** Platform · **Module:** `packages/core` · **Depends on:** [003](../archive/003-data-core/change.md), [033](../archive/033-ai-gateway-and-residency/change.md), [032](../032-data-retention-and-erasure/change.md)

## Problem

`core.audit_event` is insert-only and hash-chained, but no screen shows it and nothing verifies the chain on demand. A chat turn's steps (model calls, tool calls, the pending action, the confirm, the service write) are not linked by one trace. `ai.call` can still be updated by the app role, so cost and call records can be changed after the fact.

## Mock Delta

What changes on screen, and where to see it: [`050-immutable-trace`](../../mock/index.html#050-immutable-trace)

- New Admin screen, **Audit and trace** (Settings): chain status ("Verified to event 48,211 · 2 minutes ago"), last write-once export, then a filterable event list (person, agent, tool, record, date).
- Opening an event shows its whole trace as a timeline: prompt received, model call, read tools, pending write, confirmed by whom, service write, event emitted.
- Read only. There are no edit or delete controls, by design.

## Acceptance Criteria

1. **AC-1** Every chat turn, MCP call and job run gets a `trace_id`. Model calls (`ai.call`), tool calls, pending actions, confirm or cancel decisions and `core.audit_event` rows all carry it.
2. **AC-2** A new table `core.trace_event` records the trace steps that aren't already audited (turn received, model call, read tool, pending created, decided). It is insert-only for `amax_app`, has a trigger that blocks update and delete, and is hash-chained per tenant the same way the audit is. It holds metadata only: tool names, record ids and keyed hashes of the arguments, never prompt or record content.
3. **AC-3** `ai.call` becomes append-only too: the update grant is revoked and a trigger blocks update and delete. A test shows UPDATE and DELETE fail as `amax_app` for `ai.call`, `core.trace_event` and `core.audit_event`.
4. **AC-4** The Audit and trace screen (Admin only) shows chain status for both chains, the last daily export to write-once storage with its retention, and the filterable event list with a pin on each row. Opening a `trace_id` shows its timeline. The screen has no write controls.
5. **AC-5** "Verify now" runs the chain check (a read). A test that tampers with a row as superuser shows "Chain broken at event N" on the screen and through the read tool.
6. **AC-6** The daily write-once export covers `core.trace_event` and `ai.call` as well as the audit. The read tools `search_audit` and `get_trace` are Admin-only and go through the same permission model as the screen.
7. **AC-7** Erasure (032) can remove a person's identifying data without breaking either chain, because the chain is computed over keyed hashes rather than raw values (test). Typecheck, unit tests, lint and e2e stay green.

## Tasks

- [ ] `T1` — Audit and trace screen at `/settings/audit`: chain tickets, last export, filterable event list and trace timeline, read only, a pin on every ticket and row (AC-4, AC-5)
  Files: apps/web/app/(app)/settings/audit/page.tsx, apps/web/app/(app)/settings/audit/audit.css, apps/web/components/shell/ProfileMenu.tsx, apps/web/tests/e2e/audit.spec.ts
- [x] `T2` — Migration 0021: `core.trace_event` (RLS, insert-only, chained), `trace_id` on `ai.call` and `core.audit_event`, keyed-hash columns for audit chain v2, append-only triggers (ai.call blocks non-owner roles so later owner migrations still run), `core.erase_subject()` (AC-1, AC-2, AC-3, AC-7)
  Files: packages/db/migrations/0021_immutable_trace.sql, packages/core/src/schema.ts
- [x] `T3` — Trace context and chains in core: `withTrace`/`currentTrace`, `appendTrace`/`traceStep`, `verifyTraceChain`; audit chain v2 over keyed hashes with `trace_id`; job runs get a trace (AC-1, AC-2, AC-7)
  Files: packages/core/src/trace.ts, packages/core/src/audit.ts, packages/core/src/service.ts, packages/core/src/jobs.ts, packages/core/src/server.ts
  Depends: T2
- [x] `T4` — Propagate the trace: chat turns, pending cards, confirm/cancel decisions, MCP calls, tool calls (including denied) and model calls in `ai.call` (AC-1, AC-2)
  Files: packages/chat/src/engine.ts, packages/mcp/src/registry.ts, packages/mcp/src/server.ts, packages/ai/src/gateway.ts
  Depends: T3
- [ ] `T5` — Read side: `auditStatus`, `searchAudit`, `getTrace` in core; Admin-only read tools `search_audit`, `get_trace`, `audit_status` (permission `core.audit.read`); export covers `core.trace_event` and `ai.call` and records itself in the audit (AC-4, AC-5, AC-6)
  Files: packages/core/src/audit-read.ts, packages/core/src/audit-export.ts, packages/mcp/src/registry.ts
  Depends: T3
- [ ] `T6` — Tests: tamper tests as `amax_app` (UPDATE/DELETE fail on all three tables, trigger proven with a temporary grant), superuser tamper shows "Chain broken at event N" via the read tool, erasure keeps both chains verifiable, trace propagation through chat and MCP, export coverage (AC-1..AC-7)
  Files: packages/core/tests/trace-ac2-ac3-append-only.test.ts, packages/core/tests/trace-ac5-tamper.test.ts, packages/core/tests/trace-ac7-erasure.test.ts, packages/core/tests/trace-ac6-export.test.ts, packages/core/tests/ac7-chain.test.ts, packages/core/tests/ac7-export.test.ts, modules/delivery/tests/trace-ac1.test.ts
  Depends: T4, T5

## Verify
