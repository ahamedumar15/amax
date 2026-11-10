import { z } from "zod";

/** A commit time from a skewed clock or a hand-written payload must not land in the future. */
export const SKEW_MS = 5 * 60_000;
export const notFuture = (t: string) => Date.parse(t) <= Date.now() + SKEW_MS;

/**
 * 094 review round 1: a date the repo gives (a change's created date, a task's tick). One past now (a skewed clock)
 * reads as unknown (null), so amax keeps the date it has rather than storing a future one.
 */
export const repoTime = z.string().datetime({ offset: true }).transform((t) => (notFuture(t) ? t : null)).nullable().optional();

const PHASE = z.enum(["proposal", "tasks", "verify", "pr", "archived"]);
/** 094 AC-3: when each phase was reached in the repo; future times are left out. Absent: the sender didn't read them. */
export const repoPhaseTimes = z.partialRecord(PHASE, z.string().datetime({ offset: true }))
  .transform((p) => Object.fromEntries(Object.entries(p).filter(([, t]) => t && notFuture(t))) as Record<string, string>).optional();
