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

## Verify
