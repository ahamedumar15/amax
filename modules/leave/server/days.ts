import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";

const DAY = 86_400_000;
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const asDay = (v: unknown) => (v instanceof Date ? isoDay(v) : String(v).slice(0, 10));
export const addDays = (iso: string, n: number) => isoDay(new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY));
export const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
export const isWeekend = (iso: string) => weekday(iso) === 0 || weekday(iso) === 6;

export function realDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(d.getTime()) || isoDay(d) !== iso) throw new Error(`${iso} isn't a real date (YYYY-MM-DD)`);
  return iso;
}

/** Every date from `from` to `to`, inclusive. */
export function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Working days in a range: Monday to Friday, less the holidays given. */
export const workingDays = (from: string, to: string, holidays: Set<string>) => daysBetween(from, to).filter((d) => !isWeekend(d) && !holidays.has(d));

/** The month's dates, for "YYYY-MM". */
export function monthDays(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export type Holiday = { on: string; name: string; kind: string; country: string };

export async function holidaysIn(tx: Tx, country: string | null, from: string, to: string): Promise<Holiday[]> {
  const only = country ? sql`and country = ${country}` : sql``;
  const rows = await tx.execute(sql`select to_char(on_date, 'YYYY-MM-DD') as on, name, kind, country from leave.holiday where on_date between ${from} and ${to} ${only} order by on_date, name`);
  return rows.map((r) => ({ on: r.on as string, name: r.name as string, kind: r.kind as string, country: String(r.country) }));
}

export async function countryOf(tx: Tx, legalEntityId: string): Promise<string> {
  const [e] = await tx.execute(sql`select country from core.legal_entity where id = ${legalEntityId}`);
  if (!e) throw new Error("no such legal entity");
  return String(e.country);
}

/** "Today" for the tenant: its leave.clock_pin row, else the real date (UTC). */
export async function todayOf(tx: Tx): Promise<string> {
  const [r] = await tx.execute(sql`select to_char(today, 'YYYY-MM-DD') as today from leave.clock_pin`);
  return (r?.today as string | undefined) ?? isoDay(new Date());
}
