import { PinButton } from "@amax/ui";
import { reportPin } from "../pins";
import type { Report } from "../server/view";
import { AskButton } from "./AskButton";
import { TrendChart } from "./TrendChart";

export function Trend({ r }: { r: Report }) {
  const pin = reportPin(`Utilisation, 12 months to ${r.monthName}`, r.month);
  return (
    <section className="card pinnable">
      <div className="card-head">
        <h2>Utilisation, last 12 months</h2>
        <div className="actions">
          <span className="muted">Target {r.target}%</span>
          <AskButton className="btn sm ghost" label="Change target" name="Ask amax to change the utilisation target" prompt={`Change the utilisation target from ${r.target}% to `} pin={pin} />
        </div>
        <PinButton pin={pin} />
      </div>
      <TrendChart id="trend" label={`Utilisation per month against the ${r.target}% target`} labels={r.trend.map((t) => t.label)}
        series={[{ name: "Target", color: "var(--amber)", data: r.trend.map(() => r.target), dashed: true }, { name: "Billable utilisation", color: "var(--violet)", data: r.trend.map((t) => t.utilisation), area: true }]} />
      <div className="legend" aria-hidden="true"><span><i style={{ background: "var(--violet)" }} />Billable utilisation</span><span><i className="target" />Target</span></div>
    </section>
  );
}
