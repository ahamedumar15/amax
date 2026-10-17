# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B1] `modules/delivery/server/project-create.ts:41` The `existing` path writes nothing, but it is still audited as a 'delivery.project.create' on the existing project's resourceId, with `after` holding the requester's input (for example key SRB) on project SRA. Under withIdempotency it is also counted as a write. A retried Promote leaves two create audit rows for one project. Audit the no-op as a distinct action, or skip the audit row. (round 1) <!-- fp:28a426843c7d -->
- [minor B4] `modules/delivery/db/migrations/0011_project_source_ref.sql:4` The source_ref column is added by migration, but the diff does not update modules/delivery/db/schema.ts. The module standard says db/schema.ts is the module's schema, so the Drizzle schema and the database now differ. A schema-driven migration generator could later drop the column. Add sourceRef and the partial unique index to schema.ts. (round 1) <!-- fp:4f85ed1d8737 -->
- [minor B3] `modules/delivery/server/project-create.ts:39` `bySource(...)` can return undefined, for example when the conflicting row is not visible in the caller's snapshot inside createProjectInTx under a stricter isolation level. The next line then throws a TypeError on `e.id` instead of a clear error. Check for `e` and throw a named error. (round 1) <!-- fp:3cbc052001a4 -->

## Left open by scope

- Create in the caller's transaction (presales' 020 follow-up). Round 1 found that a delivery-side `createProjectInTx` copies core's authorize→validate→write→audit pipeline, so it was dropped. Doing it properly needs core's `defineService` to run a spec inside an existing transaction (e.g. `service.inTx(tx, ctx, input)`), which is a change to `packages/core`, outside this change's scope. Until then presales uses `sourceRef`, which makes a retried or racing Promote return the same project.
