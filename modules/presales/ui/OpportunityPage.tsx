import { can } from "@amax/auth";
import type { ScreenProps } from "@amax/core";
import { moveAction } from "../actions";
import { OPEN_STAGES } from "../contracts";
import { recordsOf } from "../server/detail";
import { deliveryCreateProject } from "../server/promote";
import { getOpportunity, historyOf, type OpportunityRow } from "../server/queries";
import { ActivitiesCard } from "./ActivitiesCard";
import { DetailsCard } from "./DetailsCard";
import { HistoryCard } from "./HistoryCard";
import { LineChart } from "./LineChart";
import { LostDialog } from "./LostDialog";
import { daysBetween, day, needViewer, SignInFirst, STAGE_UI } from "./parts";
import { PromoteCard } from "./PromoteCard";
import { StageSteps } from "./StageSteps";
import { RisksCard, TasksCard } from "./TasksRisks";

const KIND: Record<string, string> = { demo: "demo", workshop: "workshop", call: "call", meeting: "meeting", proposal: "proposal", email: "email" };

function lede(o: OpportunityRow, today: string) {
  if (o.stage === "won") return `${o.number} for ${o.client}. Won on ${day(o.closedAt)}.`;
  if (o.stage === "lost") return `${o.number} for ${o.client}. Lost on ${day(o.closedAt)}: ${(o.lostReason ?? "").toLowerCase()}.`;
  const held = daysBetween(o.stageSince, today);
  return `${o.number} for ${o.client}. In ${STAGE_UI[o.stage].label} for ${held} day${held === 1 ? "" : "s"}${o.next ? `; the ${KIND[o.next.kind]} on ${day(o.next.on)} decides the next stage.` : "."}`;
}

function promotion(o: OpportunityRow, viewer: Parameters<typeof can>[0]) {
  if (o.stage !== "won") return "Available once the opportunity is won";
  if (!deliveryCreateProject()) return "Delivery doesn't offer project creation through its contract yet";
  if (!can(viewer, "presales:promote") || !can(viewer, "delivery:project:create")) return "Needs permission to create delivery projects";
  return "";
}

export async function OpportunityPage({ viewer: raw, params }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Opportunity</h1><SignInFirst /></>;
  const today = new Date().toISOString().slice(0, 10);
  const o = await getOpportunity(viewer, params.number, today);
  if (!o) return <div className="presales"><h1>Opportunity not found</h1><p className="lede">No opportunity {params.number}. <a href="/presales">Back to presales</a></p></div>;
  const [history, records] = await Promise.all([historyOf(viewer, o.id), recordsOf(viewer, o.id)]);
  const open = o.stage !== "won" && o.stage !== "lost";
  const canEdit = can(viewer, "presales:opportunity:edit");
  const next = open ? (OPEN_STAGES[OPEN_STAGES.indexOf(o.stage) + 1] ?? "won") : null;
  const why = promotion(o, viewer);
  const points = [...history].reverse();
  const rising = history[0] ? history[0].toChance > (history[0].fromChance ?? 0) : false;
  return (
    <div className="presales">
      <nav className="crumb" aria-label="Breadcrumb"><a href="/presales">Presales</a><span>/</span>{o.client}<span>/</span>{o.title}</nav>
      <div className="row head">
        <div><h1>{o.title}</h1><p className="lede">{lede(o, today)}</p></div>
        {open && canEdit && (
          <div className="actions">
            <LostDialog number={o.number} title={o.title} />
            <form action={moveAction}><input type="hidden" name="number" value={o.number} /><input type="hidden" name="to" value={next!} />
              <button className="btn primary" type="submit">Move to {STAGE_UI[next!].label}</button></form>
          </div>
        )}
      </div>
      <StageSteps stage={o.stage} history={history} />
      <nav className="tabs" aria-label="Sections">
        <a className="btn sm" href="#details" aria-current="true">Overview</a><a className="btn sm" href="#activities">Activities {records.activities.length}</a>
        <a className="btn sm" href="#tasks">Tasks {records.tasks.length}</a><a className="btn sm" href="#risks">Risks and issues {records.risks.length}</a>
      </nav>
      <div className="cols">
        <div className="stack">
          <div className="cols even"><DetailsCard o={o} /><HistoryCard history={history} today={today} /></div>
          <ActivitiesCard number={o.number} rows={records.activities} canEdit={canEdit && open} today={today} />
          <div className="cols even"><TasksCard number={o.number} rows={records.tasks} canEdit={canEdit && open} /><RisksCard number={o.number} rows={records.risks} canEdit={canEdit && open} /></div>
        </div>
        <aside className="stack">
          <div className="card">
            <div className="card-head"><h2>Win chance</h2><span className={rising ? "up" : "muted"}>{rising ? "↑ " : ""}{o.winChance}%</span></div>
            <LineChart id="winChart" label="Win chance over time" width={340} height={180} max={100} step={50}
              labels={[...points.map((h) => day(h.at)), ...(open ? [day(today)] : [])]}
              series={[{ name: "Win chance", color: "#7B61FF", area: true, data: [...points.map((h) => h.toChance), ...(open ? [o.winChance] : [])] }]} />
          </div>
          {o.nextStep && <div className="card"><div className="card-head"><h2>Next step</h2></div><p className="next-step">{o.nextStep}</p></div>}
          <PromoteCard o={o} available={!why} why={why} />
        </aside>
      </div>
    </div>
  );
}
