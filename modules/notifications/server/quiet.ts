import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { entityZone } from "@amax/workflows";

export const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function localMinutes(at: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** When quiet hours (HH:MM to HH:MM, in `zone`) end, if `at` falls inside them; null when it doesn't. */
export function quietEnd(at: Date, zone: string, starts: string, ends: string): Date | null {
  const [m, s, e] = [localMinutes(at, zone), minutes(starts), minutes(ends)];
  const inside = s < e ? m >= s && m < e : m >= s || m < e;
  if (!inside) return null;
  const wait = (e - m + 1440) % 1440;
  return new Date(Math.floor(at.getTime() / 60_000) * 60_000 + wait * 60_000);
}

/** When a message to this person may go out: now, or the end of their quiet hours in their entity's zone (030 AC-3). */
export async function sendableAt(tx: Tx, userId: string, now = new Date()): Promise<Date> {
  const [q] = await tx.execute(sql`select to_char(q.starts, 'HH24:MI') as starts, to_char(q.ends, 'HH24:MI') as ends, u.legal_entity_id
    from notifications.quiet_hours q join auth.user u on u.id = q.user_id where q.user_id = ${userId}`);
  if (!q) return now;
  return quietEnd(now, await entityZone(tx, (q.legal_entity_id as string | null) ?? null), q.starts as string, q.ends as string) ?? now;
}
