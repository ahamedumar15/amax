import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { daysBetween, holidaysIn, monthDays, type Holiday } from "./days";
import { homeEntity, requestsIn } from "./read";

/** A day's mark: the leave type when approved, "pending" while it waits, null when at work. */
export type Mark = string | null;
export type CalendarRow = { userId: string; name: string; marks: Mark[] };
export type Calendar = { month: string; days: string[]; today: string; holidays: Holiday[]; rows: CalendarRow[] };

export const monthOf = (key: string | undefined, today: string) => {
  if (key === undefined || key === "") return today.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) throw new Error(`${key} isn't a month like 2026-10`);
  return key;
};

/** The team calendar: the viewer's reports (or just the viewer, with none), their leave and the holidays of the viewer's country. */
export async function teamCalendar(tx: Tx, v: Viewer, month: string, today: string, only?: string): Promise<Calendar> {
  const days = monthDays(month), from = days[0], to = days[days.length - 1];
  const ids = (only ? [only] : v.reports.length ? v.reports : [v.userId]).filter((id) => id === v.userId || v.reports.includes(id));
  const people = ids.length ? await tx.execute(sql`select id, name from auth.user where id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) order by name`) : [];
  const leave = (await requestsIn(tx, v, from, to)).filter((r) => ids.includes(r.user_id as string));
  const country = (await homeEntity(tx, v)).country;
  const rows = people.map((p) => {
    const marks = new Map<string, Mark>();
    for (const r of leave.filter((x) => x.user_id === p.id)) for (const d of daysBetween(r.starts_on as string, r.ends_on as string)) marks.set(d, r.status === "pending" ? "pending" : (r.type as string));
    return { userId: p.id as string, name: p.name as string, marks: days.map((d) => marks.get(d) ?? null) };
  });
  return { month, days, today, holidays: country ? await holidaysIn(tx, country, from, to) : [], rows };
}
