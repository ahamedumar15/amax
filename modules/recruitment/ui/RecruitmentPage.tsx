import type { ScreenProps } from "@amax/core";
import { viewPin } from "../pins";
import { pipelineView, type PipelineView } from "../server/queries";
import { AskButton } from "./AskButton";
import { Board } from "./Board";
import { Funnel } from "./Funnel";
import { HiresChart } from "./HiresChart";
import { needViewer, plural, SignInFirst, word } from "./parts";
import { RoleSelect } from "./RoleSelect";
import { Tiles } from "./Tiles";

function lede(p: PipelineView) {
  const s = p.stats;
  const open = p.role ? `${p.role.title}: ${plural(s.openings, "opening")}.` : `${plural(s.openings, "open role")}.`;
  return s.fromDemand && s.demandReason ? `${open} ${word(s.fromDemand)} ${s.fromDemand === 1 ? "was" : "were"} raised by the resourcing agent from ${s.demandReason}.` : open;
}

// 023 T1: the stats lead, then the pipeline board (what needs a decision), then the funnel and hires
// per month. Every tile, stage, card and funnel row is pinned; writes go through Ask amax.
export async function RecruitmentPage({ viewer: raw, searchParams }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Recruitment</h1><SignInFirst /></>;
  const p = await pipelineView(viewer, searchParams?.role || undefined);
  const total = p.roles.reduce((n, r) => n + r.openings, 0);
  return (
    <div className="recruitment">
      <div className="row head">
        <div><h1>Recruitment</h1><p className="lede">{lede(p)}</p>
          {!p.seesCandidates && <p className="note">Candidate names, contact details and CVs are for HR; you see the pipeline.</p>}</div>
        <div className="actions">
          <RoleSelect roles={p.roles} at={p.role?.id} total={total} />
          <AskButton className="btn primary" label="New role" pin={viewPin("Open roles")} prompt="Open a new role: title, department, entity, openings and the skills to screen for" name="New role, ask amax" />
        </div>
      </div>
      <Tiles p={p} />
      <Board p={p} open={searchParams?.lane} />
      <div className="cols even"><Funnel p={p} /><HiresChart p={p} /></div>
    </div>
  );
}
