const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const two = (n: string) => n.padStart(2, "0");

export function cronLabel(cron: string): string {
  const [min, hour, dom, mon, dow] = cron.trim().split(/\s+/);
  const num = (s: string) => /^\d+$/.test(s);
  if (num(min) && hour === "*" && dom === "*" && mon === "*" && dow === "*") return min === "0" ? "Hourly" : `Hourly at :${two(min)}`;
  if (!num(min) || !num(hour) || mon !== "*") return cron;
  const at = `${two(hour)}:${two(min)}`;
  if (dom === "*" && dow === "*") return `Daily ${at}`;
  if (dom === "*" && num(dow) && Number(dow) < 7) return `${DAYS[Number(dow)]} ${at}`;
  if (dom === "*" && dow === "1-5") return `Weekdays ${at}`;
  if (num(dom) && dow === "*") return `Monthly, day ${dom}, ${at}`;
  return cron;
}

export const whenLabel = (iso: string | null, timeZone: string) =>
  iso ? new Intl.DateTimeFormat("en-AU", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "Not yet";
