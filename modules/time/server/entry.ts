import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, ScopeError, viewerOf } from "@amax/auth";
import type { ServiceContext } from "@amax/core/server";
import type { WeekRow } from "./weeks";

export type EntryRow = { id: string; week_id: string; user_id: string; project_id: string; day: string; hours: number; billable: boolean; note: string | null; revision: number };

/**
 * 070: one entry and its week, locked, for a correction or a delete. The caller is checked before any
 * lock, and a missing entry and someone else's give the same error.
 */
export async function lockedEntry(tx: Tx, ctx: ServiceContext, entryId: string): Promise<{ week: WeekRow; entry: EntryRow }> {
  const [owner] = await tx.execute(sql`select user_id from time.entry where id = ${entryId}`);
  const v = viewerOf(ctx);
  if (!owner || (v && !can(v, "time:log", { ownerUserId: owner.user_id as string }))) throw new ScopeError("time:log");
  const [week] = await tx.execute(sql`select w.* from time.week w join time.entry e on e.week_id = w.id where e.id = ${entryId} for update of w`);
  const [e] = await tx.execute(sql`select id, week_id, user_id, project_id, to_char(day, 'YYYY-MM-DD') as day, hours, billable, note, revision
    from time.entry where id = ${entryId} for update`);
  if (!week || !e) throw new ScopeError("time:log");
  return { week: week as WeekRow, entry: { ...(e as unknown as EntryRow), hours: Number(e.hours), revision: Number(e.revision) } };
}
