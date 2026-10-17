import { ApplicationFailure, condition, defineSignal, proxyActivities, setHandler, sleep } from "@temporalio/workflow";
import type { Command, History } from "../replay";
import type { Json } from "../types";
import { contains } from "../match";
import type { Activities, RunArgs } from "./activities";

export type EventMessage = { event: string; payload: Json; id?: string };
export const eventSignal = defineSignal<[EventMessage]>("amax.event");
export const pauseSignal = defineSignal<[boolean]>("amax.pause");

const control = proxyActivities<Activities>({ startToCloseTimeout: "1 minute", retry: { maximumAttempts: 20 } });

const failureText = (e: unknown) => {
  const err = e as { cause?: { message?: string }; message?: string };
  return err.cause?.message ?? err.message ?? String(e);
};

// The generic Temporal workflow behind every amax workflow. The definition itself runs in
// activities (plan and runStep replay it against this history), so module code never enters the
// sandbox; Temporal keeps the history, timers and signals durable.
export async function amaxRun(args: RunArgs): Promise<Json> {
  const history: History = args.history ?? { steps: {}, timers: {}, events: {} };
  const inbox: EventMessage[] = [];
  const seen = new Set<string>();
  let paused = false;
  setHandler(eventSignal, (s) => {
    if (s.id && seen.has(s.id)) return;
    if (s.id) seen.add(s.id);
    inbox.push(s);
  });
  setHandler(pauseSignal, (p) => void (paused = p));
  for (;;) {
    await condition(() => !paused);
    const r = await control.plan(args, history);
    if (r.kind === "done") {
      await control.mark(args, { status: "completed", output: r.output });
      return r.output;
    }
    if (r.kind === "failed") {
      await control.mark(args, { status: "failed", error: r.error });
      throw ApplicationFailure.nonRetryable(r.error, "AmaxWorkflowFailed");
    }
    if (r.kind === "blocked") await perform(args, history, r.command, inbox);
  }
}

async function perform(args: RunArgs, history: History, c: Command, inbox: EventMessage[]) {
  if (c.kind === "step") {
    const o = c.options;
    const step = proxyActivities<Activities>({
      startToCloseTimeout: o.timeoutMs + 5_000,
      retry: { maximumAttempts: o.maxAttempts, initialInterval: o.initialMs, maximumInterval: Math.max(o.maxMs, o.initialMs), backoffCoefficient: Math.max(1, o.backoff) },
    });
    try {
      history.steps[c.name] = { status: "done", result: await step.runStep(args, history, c.name) };
    } catch (e) {
      history.steps[c.name] = { status: "failed", error: failureText(e) };
    }
    return;
  }
  if (c.kind === "sleep") {
    await control.mark(args, { status: "sleeping", step: { name: c.name, kind: "sleep", status: "sleeping", fireInMs: c.ms } });
    await sleep(c.ms);
    history.timers[c.name] = true;
    await control.mark(args, { status: "running", step: { name: c.name, kind: "sleep", status: "done", result: null } });
    return;
  }
  await control.mark(args, { status: "waiting", step: { name: c.name, kind: "wait", status: "waiting", fireInMs: c.timeoutMs, waitEvent: c.event, waitMatch: c.match } });
  const found = () => inbox.findIndex((s) => s.event === c.event && contains(s.payload, c.match));
  const ready = () => found() >= 0;
  const arrived = c.timeoutMs === null ? (await condition(ready), true) : await condition(ready, c.timeoutMs);
  const payload = arrived ? inbox.splice(found(), 1)[0].payload : null;
  history.events[c.name] = { payload };
  await control.mark(args, { status: "running", step: { name: c.name, kind: "wait", status: "done", result: payload } });
}
