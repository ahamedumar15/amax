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
/**
 * 094 AC-3: when each phase was reached in the repo, as sent. Absent: the sender didn't read them. A phase dated in the
 * future is resolved against the stored one where the write is built (desired(), review round 2).
 */
export const repoPhaseTimes = z.partialRecord(PHASE, z.string().datetime({ offset: true })).optional();
/** 094 review round 2: the phase times a write stores (meta.repoPhases): known phases, none in the future. */
export const storedRepoPhases = z.partialRecord(PHASE, z.string().datetime({ offset: true }).refine(notFuture, "a repo phase time is in the future"));
