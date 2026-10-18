import { can } from "@amax/auth";
import type { ScreenProps } from "@amax/core";
import { OPEN_STAGES } from "../contracts";
import { recordsOf } from "../server/detail";
import { deliveryCreateProject } from "../server/promote";
import { getOpportunity, historyOf, type OpportunityRow } from "../server/queries";
import { ActivitiesCard } from "./ActivitiesCard";
import { AskButton } from "./AskButton";
import { AskChips } from "./AskChips";
import { DetailsCard } from "./DetailsCard";
import { HistoryCard } from "./HistoryCard";
import { daysBetween, day, needViewer, oppPin, SignInFirst, STAGE_UI } from "./parts";
import { PromoteCard } from "./PromoteCard";
import { StageSteps } from "./StageSteps";
import { RisksCard, TasksCard } from "./TasksRisks";
import { NextStepCard, WinCard } from "./WinCard";

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
  return (
    <div className="presales">
      <nav className="crumb" aria-label="Breadcrumb"><a href="/presales">Presales</a><span>/</span>{o.client}<span>/</span>{o.title}</nav>
      <div className="row head">
        <div><h1>{o.title}</h1><p className="lede">{lede(o, today)}</p><p className="src hint">Changes happen in chat. Pin anything, then ask.</p></div>
        <div className="actions"><AskButton className="btn primary" label="Ask amax about this deal" prompt={`About ${o.number}: `} pin={oppPin(o)} /></div>
      </div>
      <StageSteps o={o} history={history} />
      {open && canEdit && <AskChips o={o} next={next!} />}
      <nav className="tabs" aria-label="Sections">
        <a className="btn sm" href="#details" aria-current="true">Overview</a><a className="btn sm" href="#activities">Activities {records.activities.length}</a>
        <a className="btn sm" href="#tasks">Tasks {records.tasks.length}</a><a className="btn sm" href="#risks">Risks and issues {records.risks.length}</a>
      </nav>
      <div className="cols">
        <div className="stack">
          <div className="cols even"><DetailsCard o={o} /><HistoryCard opp={o} history={history} today={today} /></div>
          <ActivitiesCard opp={o} rows={records.activities} />
          <div className="cols even"><TasksCard opp={o} rows={records.tasks} /><RisksCard opp={o} rows={records.risks} canEdit={canEdit} /></div>
        </div>
        <aside className="stack">
          <WinCard o={o} history={history} today={today} />
          <NextStepCard o={o} />
          <PromoteCard o={o} why={why} />
        </aside>
      </div>
    </div>
  );
}
