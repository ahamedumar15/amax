import type { z } from "zod";
import type { Sensitivity } from "@amax/core/server";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Duration = number | `${number}${"ms" | "s" | "m" | "h" | "d"}`;
export type Classes = Record<string, Sensitivity>;

export type RetryPolicy = { maxAttempts?: number; initialInterval?: Duration; maxInterval?: Duration; backoff?: number };
export type StepOptions = { timeout?: Duration; retry?: RetryPolicy; sensitive?: Classes };
export type ResolvedStepOptions = { timeoutMs: number; maxAttempts: number; initialMs: number; maxMs: number; backoff: number; sensitive: Classes };

export type ToolCall = { tool: string; input?: Json; output?: Json };

export type StepContext = {
  tenantId: string;
  runId: string;
  step: string;
  attempt: number;
  /** Stable across retries and redeliveries of this step: pass it to external APIs so a repeat is a no-op. */
  idempotencyKey: string;
  actsFor: string | null;
  signal: AbortSignal;
  recordToolCall: (call: ToolCall) => void;
  recordCost: (usd: number) => void;
};

export type WaitOptions = { event: string; match?: Record<string, Json>; timeout?: Duration };

export type WorkflowContext = {
  tenantId: string;
  runId: string;
  actsFor: string | null;
  step: <T>(name: string, fn: (ctx: StepContext) => Promise<T>, options?: StepOptions) => Promise<T>;
  sleep: (name: string, duration: Duration) => Promise<void>;
  waitForEvent: <T = Json>(name: string, options: WaitOptions) => Promise<T | null>;
};

export type WorkflowDef<I = Json, O = unknown> = {
  /** Unique across modules: "<module>.<workflow>". */
  name: string;
  title?: string;
  input?: z.ZodType<I>;
  sensitive?: { input?: Classes; output?: Classes };
  /** Outbox events (core.event names) this workflow waits for; they are forwarded as signals. */
  waitsFor?: string[];
  run: (ctx: WorkflowContext, input: I) => Promise<O>;
};

export type ScheduleDef = {
  /** Unique across modules: "<module>.<schedule>". */
  name: string;
  title: string;
  description?: string;
  workflow: string;
  /** Five-field cron, read in `timezone`. */
  cron: string;
  /** An IANA zone, or "entity" for one schedule per legal entity in that entity's zone. Default UTC. */
  timezone?: string;
  input?: Json;
  enabled?: boolean;
};

export type RunStatus = "running" | "sleeping" | "waiting" | "paused" | "completed" | "failed" | "cancelled";
