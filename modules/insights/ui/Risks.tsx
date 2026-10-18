import { PinButton } from "@amax/ui";
import type { InsightRef } from "../contracts";
import { insightPin, viewPin } from "../pins";
import { RISK_TABS, type RiskTab } from "../server/views";
import { AskButton } from "./AskButton";
import { num, Src } from "./parts";

const TABS: Record<RiskTab, [label: string, column: string]> = { delivery: ["Delivery", "Risk of missing the date"], commercial: ["Commercial", "Risk to the margin"], people: ["People", "Risk to the plan"] };
const DOTS = ["var(--amber)", "var(--violet)", "var(--pink)", "var(--sky)"];
const meter = (n: number) => (n >= 60 ? "var(--coral)" : n >= 25 ? "var(--amber)" : "var(--mint)");
const Trend = ({ t }: { t: unknown }) => (t === "worse" ? <span className="down">↑ worse</span> : t === "better" ? <span className="up">↓ better</span> : <span className="muted">steady</span>);

export function Risks({ risks, tab, horizon }: { risks: InsightRef[]; tab: RiskTab; horizon: string }) {
  const rows = risks.filter((r) => r.data.tab === tab);
  return (
    <section className="card flush pinnable" id="risks" aria-labelledby="risks-title">
      <div className="card-head">
        <h2 id="risks-title">Projects at risk</h2>
        <nav className="seg" aria-label="Risk view">
          {RISK_TABS.map((t) => <a key={t} href={`/insights?horizon=${horizon}&risk=${t}#risks`} aria-current={t === tab ? "page" : undefined}>{TABS[t][0]}</a>)}
        </nav>
        <PinButton pin={viewPin(`Projects at risk, ${TABS[tab][0].toLowerCase()}`, horizon)} />
      </div>
      {!rows.length ? <p className="empty-line">No {TABS[tab][0].toLowerCase()} risks you can see.</p> : (
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Projects at risk, {TABS[tab][0].toLowerCase()}</caption>
          <thead><tr><th scope="col">Project</th><th scope="col" style={{ minWidth: 200 }}>{TABS[tab][1]}</th><th scope="col">Why the agent thinks so</th><th scope="col">Trend</th><th scope="col" className="num">Action</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.id} className="pinnable" data-risk={r.title}>
              <td data-label="Project"><span className="dot" style={{ background: DOTS[i % DOTS.length] }} aria-hidden="true" /><b>{r.title}</b><small>{String(r.data.due ?? "")}</small></td>
              <td data-label={TABS[tab][1]}><div className="risk"><div className="meter" aria-hidden="true"><i style={{ width: `${num(r.data.percent)}%`, background: meter(num(r.data.percent)) }} /></div><b>{num(r.data.percent)}%</b></div></td>
              <td data-label="Why">{r.body}<Src sources={r.sources} confidence={r.confidence} asOf={r.asOf} /></td>
              <td data-label="Trend"><Trend t={r.data.trend} /></td>
              <td className="num" data-label="Action">
                <AskButton label={String(r.data.action ?? "Review")} name={`${String(r.data.action ?? "Review")}: ${r.title}`} prompt={`${String(r.data.action ?? "Review")} for ${r.title}: `} pin={insightPin(r)} className={i === 0 && num(r.data.percent) >= 60 ? "btn sm primary" : "btn sm"} />
                <PinButton pin={insightPin(r)} />
              </td>
            </tr>))}</tbody>
        </table></div>
      )}
    </section>
  );
}
