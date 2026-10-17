# Allocations and capacity forecast

**Change:** 010-allocations-forecast · **Created:** 2026-10-17
**Lane:** Delivery · **Module:** `modules/allocations` · **Depends on:** [007](../007-delivery-projects/change.md), [011](../011-hr-core/change.md)

## Problem

Plan people across projects by month, see over-allocation and the bench ahead.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-allocations`](../../mock/index.html#001-amax-foundation-allocations)

Allocations: capacity vs demand, January bench, per-person monthly grid with totals.

## Acceptance Criteria

1. **AC-1** `allocations` schema: allocation (person, project, month, percent) and forecast. Per-person totals show, and over 100% is flagged.
2. **AC-2** Capacity vs demand and bench come from allocations plus HR contracts (through the `hr` contract) and match fixtures.md (January bench 6).
3. **AC-3** Copy to next month, an audited bulk action. Chat intent "allocate".

## Tasks

## Verify
