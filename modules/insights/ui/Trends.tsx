import { PinButton } from "@amax/ui";
import type { InsightRef } from "../contracts";
import { insightPin, viewPin } from "../pins";
import { Src } from "./parts";

const VERDICT: Record<string, [tone: string, label: string]> = { "take-on": ["good", "Take on"], watch: ["warn", "Watch"], skip: ["", "Skip"] };

export function Trends({ trends, horizon }: { trends: InsightRef[]; horizon: string }) {
  return (
    <section className="card pinnable" aria-labelledby="trends-title">
      <div className="card-head"><h2 id="trends-title">World trends to act on</h2><span className="chip agent">Market agent</span><PinButton pin={viewPin("World trends to act on", horizon)} /></div>
      {!trends.length ? <p className="empty-line">No trends yet.</p> : trends.map((t) => {
        const [tone, label] = VERDICT[String(t.data.verdict)] ?? VERDICT.watch;
        return (
          <div key={t.id} className="trend pinnable">
            <span className={`chip ${tone}`}>{label}</span>
            <div className="t">{t.title}<small>{t.body}</small><Src sources={t.sources} confidence={t.confidence} asOf={t.asOf} /></div>
            <PinButton pin={insightPin(t)} />
          </div>
        );
      })}
    </section>
  );
}
