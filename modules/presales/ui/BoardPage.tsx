import { can } from "@amax/auth";
import type { ScreenProps } from "@amax/core";
import { PinButton, Ticket } from "@amax/ui";
import { OPEN_STAGES, type Stage } from "../contracts";
import { openSuggestions } from "../server/detail";
import { listOpportunities, recentChanges, type OpportunityRow } from "../server/queries";
import { pipelineStats, winRateNote } from "../server/stats";
import { DealCard } from "./DealCard";
import { FillButton } from "./FillButton";
import { FoundStrip } from "./FoundStrip";
import { LineChart } from "./LineChart";
import { needViewer, SignInFirst, STAGE_UI, Stk, usd, day } from "./parts";
import { PipelineList } from "./PipelineList";
import { StageFeed } from "./StageFeed";
import { ViewControls } from "./ViewControls";

const MONTH = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
const SIX_MONTHS = 183 * 86400000;
const statPin = (label: string) => <PinButton pin={{ label, tool: "pipeline_summary", args: {} }} />;
const chartMax = (series: { total: number }[]) => Math.max(600, Math.ceil(Math.max(...series.map((p) => p.total)) / 200000) * 200);

function lede(open: OpportunityRow[], total: number, found: number) {
  const demo = open.filter((o) => o.next?.kind === "demo").sort((a, b) => a.next!.on.localeCompare(b.next!.on))[0];
  return `${usd(total)} open across ${open.length} opportunit${open.length === 1 ? "y" : "ies"}${found ? `, plus ${found} more the inbox agent found in Teams and email` : ""}.`
    + (demo ? ` ${demo.client.split(" ")[0]} has its demo on ${day(demo.next!.on)}.` : "");
}

export async function BoardPage({ viewer: raw }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Presales</h1><SignInFirst /></>;
  const today = new Date().toISOString().slice(0, 10);
  const [rows, stats, changes, found] = await Promise.all([listOpportunities(viewer, today), pipelineStats(viewer, today), recentChanges(viewer), openSuggestions(viewer)]);
  const open = rows.filter((o) => o.stage !== "won" && o.stage !== "lost");
  const closed = rows.filter((o) => (o.stage === "won" || o.stage === "lost") && Date.parse(o.closedAt!) >= Date.now() - SIX_MONTHS);
  const total = Number(stats.totals.open.amount), weighted = Number(stats.totals.weighted.amount);
  const share = total ? Math.round((weighted / total) * 100) : 0;
  const canMove = can(viewer, "presales:opportunity:edit"), canRemove = can(viewer, "presales:opportunity:remove"), canCreate = can(viewer, "presales:opportunity:create");
  const owners = [...new Set(rows.map((o) => o.ownerName).filter((n): n is string => Boolean(n)))].sort();
  const lane = (key: string, label: string, icon: string, color: string, cards: OpportunityRow[]) => (
    <section className="lane" key={key} aria-label={`${label}, ${cards.length}`}>
      <div className="lane-head"><span className="lh"><Stk icon={icon} color={color} />{label}</span> <span>{cards.length}</span></div>
      {cards.map((o) => <DealCard key={o.id} o={o} canMove={canMove} canRemove={canRemove} />)}
    </section>
  );
  return (
    <div className="presales" data-view="board">
      <div className="row head">
        <div><h1>Presales</h1><p className="lede">{lede(open, total, found.length)}</p></div>
        <div className="actions"><ViewControls owners={owners} />{canCreate && <FillButton label="Fill with amax" />}</div>
      </div>
      <div className="tickets four">
        <Ticket tone="info" label="Open pipeline" art={statPin("Open pipeline")} value={usd(total)} note={`${open.length} opportunities${found.length ? `, ${found.length} suggested` : ""}`} />
        <Ticket tone="info" label="Weighted by win chance" art={statPin("Weighted pipeline")} value={usd(weighted)} progress={{ percent: share, label: `${share}% of $${Math.round(total / 1000)}k open value` }} />
        <Ticket tone="good" label="Win rate, 12 months" art={statPin("Win rate, 12 months")} value={stats.winRate === null ? "–" : `${stats.winRate}%`} note={winRateNote(stats.winRate, stats.winRateBefore)} />
        <Ticket tone="info" label="Days to close" art={statPin("Days to close")} value={stats.daysToClose === null ? "–" : `${stats.daysToClose} days`} note="Average for won deals" />
      </div>
      <FoundStrip items={found} canAccept={canCreate} />
      <div className="board sales">
        {OPEN_STAGES.map((s: Stage) => lane(s, STAGE_UI[s].label, STAGE_UI[s].icon, STAGE_UI[s].color, open.filter((o) => o.stage === s)))}
        {lane("closed", "Closed", "trophy", "#2FCB8C", closed)}
      </div>
      <PipelineList rows={rows} />
      <div className="cols even">
        <div className="card chart-card pinnable">
          {statPin("Pipeline value per month")}
          <div className="card-head"><h2>Pipeline value</h2><span className="muted">$k, weighted vs total</span></div>
          <LineChart id="pipelineChart" label="Pipeline value per month" labels={stats.series.map((p) => MONTH(p.month))} max={chartMax(stats.series)} step={200} prefix="$" unit="k" width={560} height={210}
            series={[{ name: "Total", color: "#C3B5FF", dashed: true, data: stats.series.map((p) => Math.round(p.total / 1000)) }, { name: "Weighted", color: "#7B61FF", area: true, data: stats.series.map((p) => Math.round(p.weighted / 1000)) }]} />
          <div className="legend"><span><i style={{ background: "var(--violet)" }} />Weighted</span><span><i className="dash" />Total</span></div>
        </div>
        <StageFeed changes={changes} />
      </div>
    </div>
  );
}
