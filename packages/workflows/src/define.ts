import { AsyncLocalStorage } from "node:async_hooks";
import { CronExpressionParser } from "cron-parser";
import type { Duration, Json, ScheduleDef, StepContext, StepOptions, WaitOptions, WorkflowContext, WorkflowDef } from "./types";

const NAME = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const current = new AsyncLocalStorage<WorkflowContext>();

export const runInContext = <T>(ctx: WorkflowContext, fn: () => Promise<T>) => current.run(ctx, fn);

function here(what: string): WorkflowContext {
  const ctx = current.getStore();
  if (!ctx) throw new Error(`${what}() must be called inside a workflow's run()`);
  return ctx;
}

export function defineWorkflow<I = Json, O = unknown>(def: WorkflowDef<I, O>): WorkflowDef<I, O> {
  if (!NAME.test(def.name)) throw new Error(`workflow name "${def.name}" must look like "<module>.<workflow>"`);
  return def;
}

/** A retried step whose result is checkpointed: once it succeeds it never runs again for this run. */
export const step = <T>(name: string, fn: (ctx: StepContext) => Promise<T>, options?: StepOptions) => here("step").step(name, fn, options);
/** A durable timer: nothing runs while it waits, across restarts and deploys. */
export const sleep = (name: string, duration: Duration) => here("sleep").sleep(name, duration);
/** Waits for an event whose payload contains `match`; resolves null after `timeout`. No time limit by default. */
export const waitForEvent = <T = Json>(name: string, options: WaitOptions) => here("waitForEvent").waitForEvent<T>(name, options);

export function validTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function cron(def: ScheduleDef): ScheduleDef {
  if (!NAME.test(def.name)) throw new Error(`schedule name "${def.name}" must look like "<module>.<schedule>"`);
  if (def.cron.trim().split(/\s+/).length !== 5) throw new Error(`schedule ${def.name}: cron "${def.cron}" must have five fields`);
  CronExpressionParser.parse(def.cron);
  if (def.timezone && def.timezone !== "entity" && !validTimeZone(def.timezone)) throw new Error(`schedule ${def.name}: unknown time zone "${def.timezone}"`);
  return def;
}

export const nextFire = (cronExpr: string, tz: string, from = new Date()) => CronExpressionParser.parse(cronExpr, { currentDate: from, tz }).next().toDate();
