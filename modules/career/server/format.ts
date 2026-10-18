const opts = { timeZone: "UTC" } as const;
export const longDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, month: "short", day: "numeric", year: "numeric" });
export const month = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, month: "short", year: "numeric" });
const mon = (iso: string) => month(iso).slice(0, 3);

/** "Apr – May 2025", or "Sep 2022 – Oct 2023", or "Nov 2023 – today". */
export const range = (from: string, to: string | null) =>
  !to ? `${month(from)} – today` : from.slice(0, 4) === to.slice(0, 4) ? `${mon(from)} – ${month(to)}` : `${month(from)} – ${month(to)}`;

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "5 yrs 4 mo" from a join day to today. */
export function tenure(from: string, to: string) {
  let m = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
  if (Number(to.slice(8, 10)) < Number(from.slice(8, 10))) m--;
  return `${Math.floor(m / 12)} yrs ${m % 12} mo`;
}

/** "HR agent for Dilini Perera, Mar 22, 2024". */
export const whoWhen = (who: string | null, forWhom: string | null, at: string | null) =>
  who ? `${who}${forWhom ? ` for ${forWhom}` : ""}${at ? `, ${longDate(at)}` : ""}` : "Not in the audit trail";
