const DAY_MS = 86_400_000;
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (iso: string, n: number) => isoOf(at(iso) + n * DAY_MS);
export const shiftMonth = (month: string, n: number) => isoOf(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1)).slice(0, 7);
export const monthEnd = (month: string) => addDays(`${shiftMonth(month, 1)}-01`, -1);
/** The `n` months up to and including today's, oldest first, as YYYY-MM. */
export const monthsBack = (today: string, n: number) => Array.from({ length: n }, (_, i) => shiftMonth(today.slice(0, 7), i - n + 1));
export const monthName = (month: string, style: "long" | "short" = "long") => new Date(at(`${month}-01`)).toLocaleDateString("en-US", { month: style, timeZone: "UTC" });
export const shortDay = (iso: string) => new Date(at(iso)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
