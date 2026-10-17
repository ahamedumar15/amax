import type { Duration, ResolvedStepOptions, StepOptions } from "./types";

const UNIT: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function toMs(d: Duration): number {
  if (typeof d === "number") return d;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/.exec(d);
  if (!m) throw new Error(`invalid duration "${d}"`);
  return Math.round(Number(m[1]) * UNIT[m[2]]);
}

export const STEP_DEFAULTS = { timeout: "60s", maxAttempts: 5, initialInterval: "10s", maxInterval: "1h", backoff: 2 } as const;

export function resolveStep(o: StepOptions = {}): ResolvedStepOptions {
  const r = o.retry ?? {};
  const initialMs = Math.max(1, toMs(r.initialInterval ?? STEP_DEFAULTS.initialInterval));
  return {
    timeoutMs: toMs(o.timeout ?? STEP_DEFAULTS.timeout),
    maxAttempts: Math.max(1, r.maxAttempts ?? STEP_DEFAULTS.maxAttempts),
    initialMs,
    maxMs: Math.max(initialMs, toMs(r.maxInterval ?? STEP_DEFAULTS.maxInterval)),
    backoff: Math.max(1, r.backoff ?? STEP_DEFAULTS.backoff),
    sensitive: o.sensitive ?? {},
  };
}

// One retry schedule for both engines: Temporal is given initialMs, maxMs and backoff, which it
// applies with the same formula.
export const retryDelayMs = (o: ResolvedStepOptions, attempt: number) => Math.min(o.maxMs, o.initialMs * o.backoff ** Math.max(0, attempt - 1));
