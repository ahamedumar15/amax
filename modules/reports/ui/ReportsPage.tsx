import type { ScreenProps } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import { getReport } from "../server/view";
import { ReportCard } from "./ReportCard";
import { Trend } from "./Trend";
import { viewOf } from "./views";
import "./reports.css";

export async function ReportsPage({ viewer, searchParams }: ScreenProps) {
  const v = (viewer as Viewer | null) ?? null;
  if (!v) return <><h1>Reports</h1><Card><EmptyState icon="chart" title="Sign in to see reports" hint="Utilisation comes from the database once you're signed in." /></Card></>;
  const r = await getReport(v);
  return (
    <div className="reports">
      <h1>Utilisation in {r.monthName}</h1>
      <p className="lede">{r.lede}</p>
      {r.notes.map((n) => <p className="note" key={n}>{n}</p>)}
      <div className="stack">
        <Trend r={r} />
        <ReportCard r={r} view={viewOf(searchParams?.view)} />
      </div>
    </div>
  );
}
