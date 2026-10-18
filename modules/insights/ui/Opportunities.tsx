import { PinButton } from "@amax/ui";
import type { InsightRef } from "../contracts";
import { insightPin, viewPin } from "../pins";
import { AskButton } from "./AskButton";
import { Src } from "./parts";

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => `${((i * 220) / (values.length - 1)).toFixed(1)},${(32 - ((v - min) / Math.max(1, max - min)) * 28).toFixed(1)}`).join(" ");
  return <svg className="spark" viewBox="0 0 220 36" preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} fill="none" stroke="var(--violet)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

export function Opportunities({ items, horizon }: { items: InsightRef[]; horizon: string }) {
  return (
    <section className="card pinnable" aria-labelledby="opp-title">
      <div className="card-head"><h2 id="opp-title">Opportunities from your skills</h2><span className="muted small">Your people&apos;s skills matched with market demand</span><PinButton pin={viewPin("Opportunities from your skills", horizon)} /></div>
      {!items.length ? <p className="empty-line">No opportunities yet. The skills-to-opportunity match runs every Monday.</p> : (
        <div className="opp">
          {items.map((o) => {
            const spark = Array.isArray(o.data.spark) ? (o.data.spark as number[]) : [];
            const action = String(o.data.action ?? "Discuss");
            return (
              <article key={o.id} className="tcard pinnable" aria-label={o.title}>
                <div className="row"><span className={`chip ${o.data.tone === "warn" ? "warn" : "good"}`}>{String(o.data.chip ?? "Opportunity")}</span><span className="muted small">{String(o.data.fit ?? 0)} people fit</span></div>
                <p>{o.title}</p>
                <small className="muted">{o.body}</small>
                <Src sources={o.sources} confidence={o.confidence} asOf={o.asOf} />
                {spark.length > 1 && <><Spark values={spark} /><span className="sr">Demand trend: {spark.join(", ")}</span></>}
                <div className="foot"><span>{String(o.data.foot ?? "")}</span><AskButton label={action} name={`${action}: ${o.title}`} prompt={`${action} for ${o.title}: `} pin={insightPin(o)} /></div>
                <PinButton pin={insightPin(o)} />
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
