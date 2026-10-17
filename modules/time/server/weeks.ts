import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { ServiceContext } from "@amax/core/server";
import { isoWeekOf, parseWeekKey, weekKey, weekStart, type IsoWeek } from "../week";

export type WeekRow = Record<string, unknown> & { id: string; user_id: string; status: string; iso_year: number; iso_week: number };
export type WeekRef = { weekId?: string; person?: string; week?: string };

export const by = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);
export const keyOf = (w: WeekRow) => weekKey({ year: Number(w.iso_year), week: Number(w.iso_week) });

export function weekOrNow(key: string | undefined): IsoWeek {
  if (!key) return isoWeekOf(new Date());
  const w = parseWeekKey(key);
  if (!w) throw new Error(`${key} isn't an ISO week like 2026-W42`);
  return w;
}

/** An optional week from a URL or tool input: absent means "latest", malformed or non-existent is an error, never another week. */
export const wantedWeek = (key: string | undefined): IsoWeek | undefined => (key === undefined || key === "" ? undefined : weekOrNow(key));

export async function ensureWeek(tx: Tx, tenantId: string, user: { id: string; name: string }, w: IsoWeek): Promise<WeekRow> {
  await tx.execute(sql`insert into time.week (tenant_id, user_id, person_name, iso_year, iso_week, starts_on)
    values (${tenantId}, ${user.id}, ${user.name}, ${w.year}, ${w.week}, ${weekStart(w).toISOString().slice(0, 10)}) on conflict do nothing`);
  const [row] = await tx.execute(sql`select * from time.week where user_id = ${user.id} and iso_year = ${w.year} and iso_week = ${w.week} for update`);
  return row as WeekRow;
}

export async function findWeek(tx: Tx, ref: WeekRef): Promise<WeekRow> {
  if (ref.weekId) {
    const [row] = await tx.execute(sql`select * from time.week where id = ${ref.weekId} for update`);
    if (!row) throw new Error("no such timesheet");
    return row as WeekRow;
  }
  if (!ref.person) throw new Error("say whose timesheet: a weekId, or a person and week");
  const w = weekOrNow(ref.week);
  const rows = await tx.execute(sql`select w.*, u.email from time.week w join auth.user u on u.id = w.user_id
    where (lower(u.email) = lower(${ref.person}) or lower(w.person_name) = lower(${ref.person})) and w.iso_year = ${w.year} and w.iso_week = ${w.week} order by u.email for update of w`);
  if (rows.length === 0) throw new Error(`no timesheet for ${ref.person} in ${weekKey(w)}`);
  // An email is unique; a name may not be. Never act on whichever namesake sorts first.
  const exact = rows.filter((r) => String(r.email).toLowerCase() === ref.person!.toLowerCase());
  if (exact.length === 1) return exact[0] as WeekRow;
  if (rows.length > 1) throw new Error(`more than one ${ref.person} has a timesheet in ${weekKey(w)}; use their email (${rows.map((r) => r.email).join(", ")})`);
  return rows[0] as WeekRow;
}

export const weekProjectIds = async (tx: Tx, weekId: string) =>
  (await tx.execute(sql`select distinct project_id from time.entry where week_id = ${weekId}`)).map((r) => r.project_id as string);

export const weekHours = async (tx: Tx, weekId: string) =>
  Number((await tx.execute(sql`select coalesce(sum(hours), 0) as h from time.entry where week_id = ${weekId}`))[0].h);
