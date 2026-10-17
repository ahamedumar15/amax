import { resolveStep, toMs } from "./duration";
import { errorText, NondeterminismError, StepFailedError } from "./errors";
import { executeStep, type StepOutcome } from "./execute";
import { runInContext } from "./define";
import type { AnyWorkflow } from "./registry";
import type { Json, ResolvedStepOptions, WorkflowContext } from "./types";

export type StepRecord = { status: "done"; result: Json } | { status: "failed"; error: string };
/** What a run has already done. Both engines keep this; replay reads it instead of redoing work. */
export type History = {
  steps: Record<string, StepRecord>;
  timers: Record<string, true>;
  events: Record<string, { payload: Json | null }>;
};
export const emptyHistory = (): History => ({ steps: {}, timers: {}, events: {} });

export type Command =
  | { kind: "step"; name: string; options: ResolvedStepOptions }
  | { kind: "sleep"; name: string; ms: number }
  | { kind: "wait"; name: string; event: string; match: Record<string, Json>; timeoutMs: number | null };

export type Advance =
  | { kind: "done"; output: Json }
  | { kind: "failed"; error: string }
  | { kind: "blocked"; command: Command }
  | { kind: "executed"; name: string; options: ResolvedStepOptions; outcome: StepOutcome };

export type RunInfo = { tenantId: string; runId: string; actsFor: string | null; legalEntityId: string | null; version: number; input: Json };
type Exec = (stop?: AbortSignal) => Promise<StepOutcome>;
/** Set to run the first step that has no result yet, as attempt `attempt`. Omit to only plan.
 * `around` lets the engine record the attempt first, heartbeat while it runs, or skip it. */
export type Execute = { attempt: (step: string) => number; around?: (step: string, options: ResolvedStepOptions, attempt: number, exec: Exec) => Promise<StepOutcome> };

const SUSPEND = Symbol("amax.workflows.suspend");

// Re-runs the workflow body from the top. Recorded steps, fired timers and received events return
// their recorded values; the first thing without one stops the body and comes back as a command
// (or, with `execute`, a step is run once and its outcome returned for the engine to record).
export async function advance(def: AnyWorkflow, run: RunInfo, history: History, execute?: Execute): Promise<Advance> {
  if ((def.version ?? 1) !== run.version) return { kind: "failed", error: `workflow ${def.name} is now version ${def.version ?? 1}; this run started on version ${run.version}` };
  const seen = new Set<string>();
  let stop: Advance | null = null;
  let blocked = false;
  const claim = (name: string) => {
    if (blocked) throw SUSPEND;
    if (seen.has(name)) throw new NondeterminismError(`"${name}" is used twice in workflow ${def.name}; names must be unique per run`);
    seen.add(name);
  };
  const ctx: WorkflowContext = {
    tenantId: run.tenantId,
    runId: run.runId,
    actsFor: run.actsFor,
    legalEntityId: run.legalEntityId,
    async step(name, fn, opts) {
      claim(name);
      const rec = history.steps[name];
      if (rec?.status === "done") return rec.result as never;
      if (rec?.status === "failed") throw new StepFailedError(name, rec.error);
      const options = resolveStep(opts);
      blocked = true;
      if (!execute) stop = { kind: "blocked", command: { kind: "step", name, options } };
      else {
        const attempt = execute.attempt(name);
        const exec: Exec = (signal) => executeStep(fn, options, { tenantId: run.tenantId, runId: run.runId, step: name, attempt, actsFor: run.actsFor }, signal);
        stop = { kind: "executed", name, options, outcome: await (execute.around ? execute.around(name, options, attempt, exec) : exec()) };
      }
      throw SUSPEND;
    },
    async sleep(name, duration) {
      claim(name);
      if (history.timers[name]) return;
      blocked = true;
      stop = { kind: "blocked", command: { kind: "sleep", name, ms: toMs(duration) } };
      throw SUSPEND;
    },
    async waitForEvent(name, o) {
      if (!def.waitsFor?.includes(o.event)) throw new Error(`workflow ${def.name} waits for "${o.event}" but doesn't list it in waitsFor`);
      claim(name);
      if (name in history.events) return history.events[name].payload as never;
      blocked = true;
      stop = { kind: "blocked", command: { kind: "wait", name, event: o.event, match: o.match ?? {}, timeoutMs: o.timeout === undefined ? null : toMs(o.timeout) } };
      throw SUSPEND;
    },
  };
  try {
    const output = await runInContext(ctx, () => def.run(ctx, run.input));
    return stop ?? { kind: "done", output: output === undefined ? null : JSON.parse(JSON.stringify(output)) };
  } catch (e) {
    if (stop) return stop;
    return { kind: "failed", error: e === SUSPEND ? "workflow swallowed a suspension" : errorText(e) };
  }
}
