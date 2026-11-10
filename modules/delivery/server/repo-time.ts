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
/** 094 AC-3: when each phase was reached in the repo, as a reader sends it. Absent: the sender didn't read them. */
export const repoPhaseTimes = z.partialRecord(PHASE, z.string().datetime({ offset: true })).optional();

/** One phase as stored: when the repo reached it, and the read that said so ("main@<sha>"). */
export type RepoPhase = { at: string; source: string | null };
const time = z.string().datetime({ offset: true });
/**
 * meta.repoPhases as a write may carry it: a time per phase (a reader's), or a stored entry with its read. Times in the
 * future pass here; resolveRepoPhases treats them as unknown, the same on every path (review round 3).
 */
export const repoPhasesInMeta = z.partialRecord(PHASE, z.union([time, z.object({ at: time, source: z.string().nullable() })]));

/**
 * 094 AC-3, review rounds 1 to 3: the one rule for the phase times a write stores, applied where the write is built
 * (desired(), for "changed?") and again on the locked row (upsertSpecProposal, for every writer: push, self-sync and
 * sync_proposal). `read` absent: the sender didn't read them, so the stored ones stand. Read: each phase it gives, with
 * the read it came from (a time already stored keeps its first read); one dated in the future is unknown, so its stored
 * entry (and that entry's read) stands. Null:
 * nothing to store, and no key is written.
 */
export function resolveRepoPhases(read: unknown, source: unknown, stored: unknown): Record<string, RepoPhase> | null {
  const before = normalise(stored, null);
  if (read === undefined || read === null) return before;
  const given = normalise(read, typeof source === "string" ? source : null) ?? {};
  const out: Record<string, RepoPhase> = {};
  for (const [k, e] of Object.entries(given)) {
    // The same time as stored keeps its entry, so a phase names the read that first recorded it, not every later one.
    if (before?.[k] && Date.parse(before[k].at) === Date.parse(e.at)) out[k] = before[k];
    else if (notFuture(e.at)) out[k] = e;
    else if (before?.[k]) out[k] = before[k];
  }
  return out;
}

// A time alone (a reader's, or stored before entries kept their read) or a stored entry; anything else is dropped.
function normalise(v: unknown, source: string | null): Record<string, RepoPhase> | null {
  const parsed = repoPhasesInMeta.safeParse(v);
  if (!parsed.success) return null;
  return Object.fromEntries(Object.entries(parsed.data).map(([k, e]) => [k, typeof e === "string" ? { at: e, source } : { at: e!.at, source: e!.source }]));
}
