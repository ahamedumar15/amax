# @amax/workflows

Durable runs for agent tasks and recurring jobs (change 029). Owner: Platform lane.

## Writing a workflow

```ts
import { cron, defineWorkflow, step, sleep, waitForEvent } from "@amax/workflows";

export const riskScan = defineWorkflow({
  name: "delivery.risk-scan",
  title: "Project risk scan",
  waitsFor: ["agents.suggestion.decided"],
  async run(ctx, input: { projectId: string }) {
    const signals = await step("collect", async ({ idempotencyKey, recordCost }) => fetchSignals(input.projectId, idempotencyKey), { timeout: "2m", retry: { maxAttempts: 5 } });
    const decision = await waitForEvent("decision", { event: "agents.suggestion.decided", match: { projectId: input.projectId } });
    await sleep("cool-off", "1d");
    return { summary: `${signals.length} new risks` };
  },
});

export const daily = cron({ name: "delivery.risk-scan", title: "Project risk scan", workflow: "delivery.risk-scan", cron: "0 6 * * *", timezone: "entity" });
```

Register both in the module manifest (`workflows: [riskScan]`, `schedules: [daily]`). Modules never import an engine.

Rules:
- **Steps are idempotent.** Both engines can deliver a step more than once (a worker can die mid-step). Pass `idempotencyKey` to external APIs.
- **The body is deterministic.** It re-runs from the top on every resume; only `step` results, timers and events are remembered. Do I/O only inside steps. Names are unique per run.
- Defaults per step: 60 s timeout, 5 attempts, 10 s initial backoff doubling to 1 h. `NonRetryableError` fails a step at once; the body sees `StepFailedError` and may catch it.
- `waitForEvent` matches by event name plus a JSON subset of the payload. It has no time limit unless `timeout` is set, and a waiting run costs nothing. Events listed in `waitsFor` are forwarded from the `core.event` outbox; `signal()` delivers directly.
- Return `{ summary: "..." }` to show a plain-language last result on the scheduler.
- Classify personal fields: `sensitive: { input: { salary: "pay" } }` on the workflow, `sensitive` on a step. The Runs list masks them by the 002 policy.

## Engines

`AMAX_WORKFLOWS_ENGINE` picks one per deployment:

- `postgres` (default): runs, steps, timers, waits and schedules in the `workflows` schema, driven by `/api/jobs/tick` (Vercel Cron, Cloudflare Cron Trigger, or the k3s `worker`). Claims are leased with a fencing token.
- `temporal`: the same definitions on Temporal (self-hosted via the temporalio/temporal Helm chart, or Temporal Cloud with `TEMPORAL_API_KEY`). Set `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_TASK_QUEUE`, and run `createTemporalWorker()` (from `@amax/workflows/temporal`) in the worker. Runs are mirrored into the `workflows` tables so the Runs list and admin actions are the same.

## Admin

`/settings/workflows` (Admin): schedules with their zone, last and next run, and an on/off switch (a disabled schedule creates no runs); the Runs list with steps, waits, retries, tool calls, cost and who the run acts for; pause, resume, cancel and retry, each audited (`workflows.run.*`, `workflows.schedule.*`).

Retention: `workflowsRetention` (032 entries) and the daily `workflows.prune` job: finished runs after a year, signals after 30 days.

## Tests

`pnpm --filter @amax/workflows test` with `DATABASE_MIGRATE_URL` set. `AMAX_TEMPORAL_TESTS=1` also runs the engine suite on a local Temporal dev server (or set `TEMPORAL_ADDRESS`).
