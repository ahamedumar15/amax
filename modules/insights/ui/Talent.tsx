import { PinButton } from "@amax/ui";
import { insightPin, viewPin } from "../pins";
import { monthName } from "../server/days";
import type { Insights } from "../server/views";
import { num, Src, Stat } from "./parts";
import { TalentChart } from "./TalentChart";

export function Talent({ t, horizon, today }: { t: Insights["talent"]; horizon: string; today: string }) {
  const h = t.headcount.value, c = t.certifications?.value;
  const ai = Array.isArray(t.aiSkills?.data.series) ? (t.aiSkills!.data.series as number[]) : [];
  const pin = (label: string) => <PinButton pin={viewPin(label, horizon)} />;
  return (
    <section className="card pinnable" aria-labelledby="talent-title">
      <div className="card-head">
        <h2 id="talent-title">Talent growth</h2>
        {h.growth !== null && <span className={h.growth >= 0 ? "up" : "down"}>{h.growth >= 0 ? "↑" : "↓"} {Math.abs(h.growth)}% headcount this year ({h.start} → {h.now})</span>}
        {pin("Talent growth")}
      </div>
      <TalentChart labels={h.months.map((m) => monthName(m, "short"))}
        series={[{ name: "Headcount", color: "var(--violet)", data: h.series }, ...(ai.length ? [{ name: "People with AI skills", color: "var(--mint)", data: h.months.map((_, i) => ai[i] ?? null), dashed: true }] : [])]} />
      <div className="legend" aria-hidden="true"><span><i style={{ background: "var(--violet)" }} />Headcount</span>{ai.length > 0 && <span><i className="dash" />People with AI skills</span>}</div>
      <Src sources={[...t.headcount.sources, ...(t.aiSkills?.sources ?? [])]} confidence={t.aiSkills?.confidence ?? "high"} asOf={today} />
      <div className="hr" />
      <div className="split three">
        <Stat k="Attrition, 12 months" value={h.attrition === null ? "–" : `${h.attrition}%`} note={<span className="muted small">{h.leavers} left in 12 months</span>} pin={pin("Attrition, 12 months")} />
        {t.promoted
          ? <Stat k="Promoted this year" value={String(num(t.promoted.data.count))} note={<span className="muted small">{num(t.promoted.data.share)}% of people</span>} pin={<PinButton pin={insightPin(t.promoted)} />} />
          : <Stat k="Promoted this year" value="–" note={<span className="muted small">No promotion data yet</span>} pin={pin("Promoted this year")} />}
        <Stat k="Certifications" value={c ? String(c.valid) : "–"} note={<span className="muted small">{c ? `${c.expiring} expire soon` : "Learning isn't installed"}</span>} pin={pin("Certifications")} />
      </div>
      {t.promoted && <Src sources={[...t.promoted.sources, ...(t.certifications?.sources ?? [])]} confidence={t.promoted.confidence} asOf={t.promoted.asOf} />}
    </section>
  );
}
