import { PinButton, Ticket } from "@amax/ui";
import type { Overview } from "../server/overview";
import { plural } from "./parts";

const art = (name: string) => <svg className="art" viewBox="0 0 120 110" aria-hidden="true"><use href={`#lv-art-${name}`} /></svg>;
const stat = (label: string) => <PinButton pin={{ label, tool: "get_leave_overview", args: {} }} />;
const COUNTRY: Record<string, string> = { LK: "Sri Lankan", AU: "Australian" };

export function Tickets({ o }: { o: Overview }) {
  const { onLeave, booked, unusedAnnual } = o.stats;
  const clashing = o.waiting.filter((r) => r.clashes.length).length;
  const byType = onLeave.byType.map(([t, n]) => `${n} ${(o.labels[t] ?? t).toLowerCase()}`).join(", ");
  return (
    <div className="tickets four">
      <Ticket tone="info" label="On leave today" value={String(onLeave.people)} note={byType || "Everyone is in"} art={<>{art("calendar")}{stat("On leave today")}</>} />
      <Ticket tone="attention" label="Waiting for approval" value={String(o.waiting.length)} note={clashing ? `${clashing} clash${clashing === 1 ? "es" : ""} with a release` : "No release clashes"} art={<>{art("clock")}{stat("Waiting for approval")}</>} />
      <Ticket tone="info" label="Booked this month" value={plural(booked.days, "day")} note={`Across ${plural(booked.people, "person", "people")}`} art={<>{art("plane")}{stat("Booked this month")}</>} />
      <Ticket tone="attention" label="Unused annual leave" value={plural(unusedAnnual.days, "day")}
        note={unusedAnnual.country ? `${COUNTRY[unusedAnnual.country] ?? unusedAnnual.entity} entity only; payroll values the liability` : "No balances yet"} art={<>{art("coins")}{stat("Unused annual leave")}</>} />
    </div>
  );
}
