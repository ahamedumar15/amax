import { z } from "zod";
import { isRead } from "../sync/sha";

/** A commit time from a skewed clock or a hand-written payload must not land in the future. */
export const SKEW_MS = 5 * 60_000;
export const notFuture = (t: string) => Date.parse(t) <= Date.now() + SKEW_MS;

/**
 * 094 review round 1: a date the repo gives (a change's created date, a task's tick), as a tool input takes it: a plain
 * datetime, so every tool's input converts to JSON Schema for chat (095 AC-1: no transform). One past now (a skewed
 * clock) reads as unknown where it's written (knownTime), so amax keeps the date it has rather than storing a future one.
 */
export const repoTime = z.string().datetime({ offset: true }).nullable().optional();
/**
 * 062, 096 AC-4: the commit time a spec was read at, for every writer (sync_specclaw, sync_proposal, mark_synced). One in
 * the future is refused: it would mark the proposal stale against every real push until the clock caught up. A refine,
 * so the tool input still converts to JSON Schema.
 */
export const commitTime = z.string().datetime({ offset: true }).refine(notFuture, "committedAt is in the future");
/**
 * 096 review round 1: a repo time as the reader found it (a state.json `at` may lack an offset, or be only a day): an
 * instant in ISO when it parses, else null. One rule where the write is built (desired()) and where it's stored.
 */
export const repoInstant = (t: unknown) => (typeof t === "string" && t && !Number.isNaN(Date.parse(t)) ? new Date(t).toISOString() : null);
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

/**
 * 094 AC-3, 096 AC-1: the one rule for the phase times a write stores, applied where the write is built (desired(), for
 * "changed?") and again on the locked row (upsertSpecProposal, for every writer: push, self-sync and sync_proposal).
 * A phase the repo reached stays recorded: a read that leaves it out (no state.json, a status that moved on) keeps the
 * stored entry. A read that gives a phase a new time replaces it, with this write's read; the same time keeps the read
 * that first recorded it; a time in the future is unknown, so the stored entry stands. `read` absent: the sender didn't
 * read them. Null: nothing to store, and no key is written.
 */
export function resolveRepoPhases(read: unknown, source: unknown, stored: unknown): Record<string, RepoPhase> | null {
  const before = entries(stored, null);
  if (read === undefined || read === null) return before;
  const out: Record<string, RepoPhase> = { ...before };
  for (const [k, e] of Object.entries(times(read, readOf(source)))) {
    if (before?.[k] && Date.parse(before[k].at) === Date.parse(e.at)) continue;
    if (notFuture(e.at)) out[k] = e;
  }
  return out;
}

// 096 AC-3: a write's read is recorded only when it's "<ref>@<sha>" by the one read rule (sync/sha.ts); otherwise none.
const readOf = (source: unknown) => (isRead(source) ? source : null);

// 096 AC-2: entry by entry, so one malformed entry is skipped and the others stand.
const isTime = (v: unknown): v is string => time.safeParse(v).success;
function each(v: unknown, one: (e: unknown) => RepoPhase | null): Record<string, RepoPhase> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, RepoPhase> = {};
  for (const [k, e] of Object.entries(v)) {
    if (!PHASE.safeParse(k).success) continue;
    const entry = one(e);
    if (entry) out[k] = entry;
  }
  return out;
}
/** A reader's times (each with this write's read). */
const times = (v: unknown, source: string | null) => each(v, (e) => (isTime(e) ? { at: e, source } : null));
/** As stored: an entry with its read, or a plain time (stored before entries kept their read). Null when none. */
function entries(v: unknown, source: string | null): Record<string, RepoPhase> | null {
  if (v === undefined || v === null) return null;
  return each(v, (e) => {
    if (isTime(e)) return { at: e, source };
    const o = e as { at?: unknown; source?: unknown } | null;
    // A stored read is kept as stored (review round 1): only a write's own read is checked.
    return o && typeof o === "object" && isTime(o.at) ? { at: o.at, source: typeof o.source === "string" ? o.source : null } : null;
  });
}

/** The phase times alone, by phase: what a write carries in meta and what "changed?" compares. */
export const phaseTimesOnly = (v: Record<string, RepoPhase> | null) =>
  v ? Object.fromEntries(Object.entries(v).map(([k, e]) => [k, new Date(e.at).toISOString()])) : undefined;
