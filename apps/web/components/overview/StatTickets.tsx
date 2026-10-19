import type { OverviewTicket } from "@amax/core";
import { PinButton, Ticket } from "@amax/ui";

/** 068 AC-1: the stat tickets that lead the Overview, each pinned to its metric. */
export function StatTickets({ tickets }: { tickets: OverviewTicket[] }) {
  if (!tickets.length) return null;
  return (
    <div className="tickets overview-tickets">
      {tickets.map((t) => (
        <Ticket key={t.key} tone={t.tone} label={t.label} value={t.value} art={<PinButton pin={t.pin} />}
          {...(t.percent === undefined ? { note: t.note } : { progress: { percent: t.percent, label: t.note } })} />
      ))}
    </div>
  );
}
