# Presales pipeline

**Change:** 020-presales · **Created:** 2026-10-17
**Lane:** Sales · **Module:** `modules/presales` · **Depends on:** [007](../007-delivery-projects/change.md), [003](../003-data-core/change.md)

## Problem

Opportunities from new idea to won or lost, with activities, tasks, risks and promotion to a delivery project.

## Mock Delta

What changes on screen, and where to see it: [`001-amax-foundation-presales`](../../mock/index.html#001-amax-foundation-presales)

Presales board with Move, the opportunity page (stage history, win chance, activities, tasks, risks), Mark as lost, Promote to delivery.

## Acceptance Criteria

1. **AC-1** `presales` schema: client, opportunity (stage, win chance, value with currency, health computed from risks), activity, task, risk and stage history (every change logged with who and when).
2. **AC-2** Moving stage is explicit and audited. Lost needs a reason. Promote to delivery creates a project through the delivery contract.
3. **AC-3** Chat intent "new opportunity". The pipeline converts to USD with the original currency kept, and matches fixtures.md ($596,000 open).

## Tasks

## Verify
