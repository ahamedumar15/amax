import { z } from "zod";

/** A commit time from a skewed clock or a hand-written payload must not land in the future. */
export const SKEW_MS = 5 * 60_000;
export const notFuture = (t: string) => Date.parse(t) <= Date.now() + SKEW_MS;

/**
 * 094 review round 1: a date the repo gives (a change's created date, a task's tick), as a tool input takes it: a plain
 * datetime, so every tool's input converts to JSON Schema for chat (095 AC-1: no transform). One past now (a skewed
 * clock) reads as unknown where it's written (knownTime), so amax keeps the date it has rather than storing a future one.
 */
export const repoTime = z.string().datetime({ offset: true }).nullable().optional();
/** A repo date amax may store: null when it's absent or in the future. */
export const knownTime = (t: string | null | undefined) => (t && notFuture(t) ? t : null);

const PHASE = z.enum(["proposal", "tasks", "verify", "pr", "archived"]);
/** 094 AC-3: when each phase was reached in the repo, as a reader sends it. Absent: the sender didn't read them. */
export const repoPhaseTimes = z.partialRecord(PHASE, z.string().datetime({ offset: true })).optional();

/** One phase as stored: when the repo reached it, and the read that said so ("main@<sha>"). */
export type RepoPhase = { at: string; source: string | null };
const time = z.string().datetime({ offset: true });
/**
 * meta.repoPhases as a write carries it: a time per phase. The read each one came from is the write's own (meta.source),
 * never the caller's word (final pass). Times in the future pass here; resolveRepoPhases treats them as unknown, the
 * same on every path (review round 3).
 */
export const repoPhasesInMeta = z.partialRecord(PHASE, time);
// As stored: an entry with its read, or a plain time (stored before entries kept their read).
const storedPhases = z.partialRecord(PHASE, z.union([time, z.object({ at: time, source: z.string().nullable() })]));

/**
 * 094 AC-3, review rounds 1 to 3: the one rule for the phase times a write stores, applied where the write is built
 * (desired(), for "changed?") and again on the locked row (upsertSpecProposal, for every writer: push, self-sync and
 * sync_proposal). `read` absent: the sender didn't read them, so the stored ones stand. Read: each phase it gives, with
 * the read it came from (a time already stored keeps its first read); one dated in the future is unknown, so its stored
 * entry (and that entry's read) stands. Null:
 * nothing to store, and no key is written.
 */
export function resolveRepoPhases(read: unknown, source: unknown, stored: unknown): Record<string, RepoPhase> | null {
  const before = normalise(storedPhases, stored, null);
  if (read === undefined || read === null) return before;
  const given = normalise(repoPhasesInMeta, read, typeof source === "string" ? source : null) ?? {};
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
function normalise(schema: z.ZodType<Partial<Record<string, string | RepoPhase>>>, v: unknown, source: string | null): Record<string, RepoPhase> | null {
  const parsed = schema.safeParse(v);
  if (!parsed.success) return null;
  return Object.fromEntries(Object.entries(parsed.data).map(([k, e]) => [k, typeof e === "string" ? { at: e, source } : { at: e!.at, source: e!.source }]));
}

/** The phase times alone, by phase: what a write carries in meta and what "changed?" compares. */
export const phaseTimesOnly = (v: Record<string, RepoPhase> | null) =>
  v ? Object.fromEntries(Object.entries(v).map(([k, e]) => [k, new Date(e.at).toISOString()])) : undefined;
