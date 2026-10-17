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
  return {
    timeoutMs: toMs(o.timeout ?? STEP_DEFAULTS.timeout),
    maxAttempts: Math.max(1, r.maxAttempts ?? STEP_DEFAULTS.maxAttempts),
    initialMs: toMs(r.initialInterval ?? STEP_DEFAULTS.initialInterval),
    maxMs: toMs(r.maxInterval ?? STEP_DEFAULTS.maxInterval),
    backoff: r.backoff ?? STEP_DEFAULTS.backoff,
    sensitive: o.sensitive ?? {},
  };
}

export const retryDelayMs = (o: ResolvedStepOptions, attempt: number) => Math.min(o.maxMs, o.initialMs * o.backoff ** Math.max(0, attempt - 1));
