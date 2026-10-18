import type { ScreenProps } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import { HORIZONS } from "../contracts";
import { boardPackCsv } from "../server/csv";
import { getInsights, horizonOf, riskTabOf } from "../server/views";
import { Briefing } from "./Briefing";
import { Jobs } from "./Jobs";
import { Market } from "./Market";
import { Opportunities } from "./Opportunities";
import { ExportLink } from "./parts";
import { Risks } from "./Risks";
import { Talent } from "./Talent";
import { Trends } from "./Trends";
import "./insights.css";

const LABEL = { "90d": "Next 90 days", "12m": "Next 12 months" } as const;

export async function InsightsPage({ viewer, searchParams }: ScreenProps) {
  const v = (viewer as Viewer | null) ?? null;
  if (!v) return <><h1>Insights</h1><Card><EmptyState icon="spark" title="Sign in to see insights" hint="Insights come from the database once you're signed in." /></Card></>;
  const r = await getInsights(v, horizonOf(searchParams?.horizon));
  return (
    <div className="insights">
      <div className="head">
        <div><h1>Insights</h1><p className="lede">Agents read your projects, people, pipeline and the market every week, then tell you where you&apos;re heading and what to do next.</p></div>
        <div className="actions">
          <nav className="seg" aria-label="Horizon">{HORIZONS.map((h) => <a key={h} href={`/insights?horizon=${h}`} aria-current={h === r.horizon ? "page" : undefined}>{LABEL[h]}</a>)}</nav>
          <ExportLink filename={`insights-board-pack-${r.today}.csv`} csv={boardPackCsv(r)} label="Board pack" />
        </div>
      </div>
      {r.notes.map((n) => <p className="note" key={n}>{n}</p>)}
      <Briefing points={r.briefing} horizon={r.horizon} />
      <Risks risks={r.risks} tab={riskTabOf(searchParams?.risk)} horizon={r.horizon} />
      <Opportunities items={r.opportunities} horizon={r.horizon} />
      <div className="cols even">
        <Talent t={r.talent} horizon={r.horizon} today={r.today} />
        <Market m={r.market} horizon={r.horizon} />
      </div>
      <div className="cols even">
        <Trends trends={r.trends} horizon={r.horizon} />
        <Jobs jobs={r.jobs} canSwitch={r.canSwitch} horizon={r.horizon} />
      </div>
    </div>
  );
}
