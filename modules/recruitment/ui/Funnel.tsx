import { PinButton } from "@amax/ui";
import { viewPin } from "../pins";
import type { PipelineView } from "../server/queries";

const COLORS = ["#C3B5FF", "#A792FF", "#7B61FF", "#F2A93B", "#2FCB8C"];

// Reached each stage this quarter, cumulative; each bar is a share of everyone who applied.
export function Funnel({ p }: { p: PipelineView }) {
  const top = p.funnel[0]?.count || 1;
  return (
    <div className="card">
      <PinButton pin={viewPin("Hiring funnel", p.role?.id)} />
      <div className="card-head"><h2>Hiring funnel</h2><span className="muted">{p.role ? p.role.title : "All roles"}, this quarter</span></div>
      <ol className="funnel">
        {p.funnel.map((f, i) => (
          <li key={f.label} className="pinnable">
            <PinButton pin={viewPin(`${f.label} this quarter`, p.role?.id)} />
            <span>{f.label}</span><i style={{ width: `${Math.round((100 * f.count) / top)}%`, background: COLORS[i] }} aria-hidden="true" /><b>{f.count}</b>
          </li>
        ))}
      </ol>
    </div>
  );
}
