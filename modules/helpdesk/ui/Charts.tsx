import { PinButton } from "@amax/ui";
import { viewPin } from "../pins";
import type { HelpdeskView } from "../server/views";
import { Donut } from "./Donut";
import { WeekChart } from "./WeekChart";

export function Charts({ v }: { v: HelpdeskView }) {
  return (
    <div className="cols even">
      <div className="card pinnable">
        <PinButton pin={viewPin("Tickets per week")} />
        <div className="card-head"><h2>Tickets per week</h2><span className="muted small">Solved by the agent vs by people</span></div>
        <WeekChart weeks={v.stats.weeks} />
        <div className="legend" aria-hidden="true"><span><i className="agent" />Solved by agent</span><span><i className="people" />Solved by people</span></div>
      </div>
      <div className="card pinnable">
        <PinButton pin={viewPin(`Tickets by category, ${v.month}`)} />
        <div className="card-head"><h2>Tickets by category</h2><span className="muted small">{v.month}</span></div>
        <Donut label={`Tickets by category, ${v.month}`} sub="tickets" parts={v.stats.categories.map((c) => ({ name: c.category, value: c.count, pin: viewPin(`${c.category} tickets, ${v.month}`) }))} />
      </div>
    </div>
  );
}
