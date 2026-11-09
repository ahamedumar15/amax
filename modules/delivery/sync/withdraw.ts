import { isWithdrawn } from "../server/readiness";

type Row = Record<string, unknown>;

/** "main@4f2c9a1" → "main": the ref a record or proposal was read from, without its commit. Anything else unchanged. */
export const refOf = (source: unknown) => (typeof source === "string" ? source.replace(/@[0-9a-f]{7,40}$/i, "") : source);

// 089 review round 1: one rule for every specclaw writer (sync_specclaw's push and the self-sync) on which proposals a
// sync withdraws. A proposal whose folder the sync didn't read is withdrawn only when the sync read the ref that last
// synced it (`refs`; null for the self-sync, which reads main and every specclaw branch at once), no newer commit has
// synced it (push.ts's stale rule), and it isn't Released. A sync that read nothing, or that would withdraw more than
// half of the live proposals (and more than two), withdraws nothing: an unreadable or wrong checkout looks exactly like
// "every folder was deleted", so a person decides. `rows` is every stored specclaw proposal of the project; `named`, the keys read.
export function planWithdrawals(rows: Map<string, Row>, o: { named: Set<string>; refs: Set<string> | null; committedAt: string; read: number }) {
  const live = [...rows.values()].filter((r) => !isWithdrawn(r)).length;
  const keys = [...rows].filter(([key, r]) => !o.named.has(key) && !isWithdrawn(r) && r.phase !== "released"
    && (!o.refs || o.refs.has(refOf((r.meta as Row | null)?.source) as string))
    && (!r.synced_commit_at || new Date(r.synced_commit_at as string) <= new Date(o.committedAt))).map(([key]) => key);
  if (!keys.length) return { keys, held: null };
  if (!o.read) return { keys: [], held: `withdrawal held: the sync read no changes, so it can't tell which ${keys.length} were deleted` };
  if (keys.length > Math.max(2, Math.floor(live / 2))) return { keys: [], held: `withdrawal held: it would withdraw ${keys.length} of ${live} live proposals; check the checkout` };
  return { keys, held: null };
}
