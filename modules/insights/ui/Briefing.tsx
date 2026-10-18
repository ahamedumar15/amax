import { PinButton } from "@amax/ui";
import type { InsightRef } from "../contracts";
import { insightPin, viewPin } from "../pins";
import { AskButton } from "./AskButton";
import { num, Src } from "./parts";

const WRITER: Record<string, string> = { "job:insights.briefing": "the strategy agent" };
const writer = (by: string) => WRITER[by.split(" for ")[0]] ?? by;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).replace(",", "");

export function Briefing({ points, horizon }: { points: InsightRef[]; horizon: string }) {
  const pin = viewPin("This week's briefing", horizon);
  if (!points.length) return <section className="brief pinnable"><h2>This week&apos;s briefing</h2><PinButton pin={pin} /><p className="sub">No briefing yet. The strategy agent writes one every Monday from the current insights.</p></section>;
  const signals = Math.max(...points.map((p) => num(p.data.signals)));
  const evidence = [...new Map(points.flatMap((p) => p.sources).map((s) => [`${s.label}${s.evidenceRef}`, s])).values()];
  return (
    <section className="brief pinnable" aria-labelledby="brief-title">
      <h2 id="brief-title">This week&apos;s briefing</h2>
      <PinButton pin={pin} />
      <p className="sub">Written by {writer(points[0].recordedBy)} on {day(points[0].asOf)}{signals ? ` from ${signals.toLocaleString("en-US")} signals` : ""}. Each point links to its evidence.</p>
      <ol>
        {points.map((p) => (
          <li key={p.id} className="pinnable">
            <b>{p.title}</b>{p.body}
            {p.suggestion && <small>Suggest: {p.suggestion}</small>}
            <Src sources={p.sources} confidence={p.confidence} asOf={p.asOf} />
            <PinButton pin={insightPin(p)} />
          </li>
        ))}
      </ol>
      <div className="actions">
        <AskButton className="btn" label="Discuss with amax" prompt="Let's discuss this week's briefing. " pin={pin} />
        <details className="evidence">
          <summary className="btn ghost">Show evidence</summary>
          <ul>{evidence.map((s) => <li key={`${s.label}${s.evidenceRef}`}><a href={s.evidenceRef}>{s.label}</a></li>)}</ul>
        </details>
      </div>
    </section>
  );
}
