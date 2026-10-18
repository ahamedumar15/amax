export const HOURS_PER_DAY = 8;

const DAY_MS = 86_400_000;
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => isoOf(at(iso) + n * DAY_MS);
export const asDay = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

export function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = at(from); t <= at(to); t += DAY_MS) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) out.push(isoOf(t));
  }
  return out;
}

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const monthStart = (month: string) => `${month}-01`;
export const monthEnd = (month: string) => addDays(isoOf(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)), -1);
export const monthOfDay = (iso: string) => iso.slice(0, 7);
export const shiftMonth = (month: string, n: number) => isoOf(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1)).slice(0, 7);
export const monthName = (month: string, style: "long" | "short" = "long") =>
  new Date(at(monthStart(month))).toLocaleDateString("en-US", { month: style, timeZone: "UTC" });
export const shortDay = (iso: string) => new Date(at(iso)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export type Range = { from: string; to: string };

/** A month's report range: the whole month, or up to today in the current month. Null for a month that hasn't started. */
export function rangeOf(month: string, today: string): Range | null {
  if (monthStart(month) > today) return null;
  const end = monthEnd(month);
  return { from: monthStart(month), to: end < today ? end : today };
}
