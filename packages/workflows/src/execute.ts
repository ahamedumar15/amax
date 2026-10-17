import { errorText, isRetryable } from "./errors";
import type { Json, ResolvedStepOptions, StepContext, ToolCall } from "./types";

export type StepOutcome =
  | { ok: true; result: Json; toolCalls: ToolCall[]; costUsd: number }
  | { ok: false; error: string; retryable: boolean; toolCalls: ToolCall[]; costUsd: number };

export type StepIdentity = { tenantId: string; runId: string; step: string; attempt: number; actsFor: string | null };

const toJson = (v: unknown): Json => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

export const idempotencyKeyOf = (runId: string, step: string) => `wf:${runId}:${step}`;

// Runs one attempt of a step under its timeout. The abort signal tells the step to stop; a step that
// ignores it is still abandoned here, which is why steps must be idempotent.
export async function executeStep(fn: (ctx: StepContext) => Promise<unknown>, options: ResolvedStepOptions, id: StepIdentity): Promise<StepOutcome> {
  const toolCalls: ToolCall[] = [];
  let costUsd = 0;
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ctx: StepContext = {
    ...id,
    idempotencyKey: idempotencyKeyOf(id.runId, id.step),
    signal: abort.signal,
    recordToolCall: (call) => void toolCalls.push(toJson(call) as ToolCall),
    recordCost: (usd) => void (costUsd += usd),
  };
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort.abort();
      reject(new Error(`step "${id.step}" timed out after ${options.timeoutMs} ms`));
    }, options.timeoutMs);
  });
  try {
    const result = toJson(await Promise.race([fn(ctx), timeout]));
    return { ok: true, result, toolCalls, costUsd };
  } catch (e) {
    return { ok: false, error: errorText(e), retryable: isRetryable(e), toolCalls, costUsd };
  } finally {
    clearTimeout(timer);
  }
}
