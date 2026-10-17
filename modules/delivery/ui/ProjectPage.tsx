import { can } from "@amax/auth";
import type { ScreenProps } from "@amax/core";
import { moveAction } from "../actions";
import { PHASES, type Phase } from "../contracts";
import { getProject, type ProposalRow } from "../server/queries";
import { initials, needViewer, PHASE_UI, SignInFirst, Stk, Tabs } from "./parts";

const LANE_LABEL: Record<Phase, string> = { proposed: "Proposed", planned: "Planned", building: "Building", verified: "Verified", released: "Released to Prod" };
const MOVABLE = PHASES.filter((p) => p !== "released");

// Facts the specclaw sync adds (039): lane, queue status, claim, PR.
function SpecFacts({ p }: { p: ProposalRow }) {
  const m = p.meta as { lane?: string; status?: string; waiting?: string[]; claim?: string | null; pr?: string | null; withdrawn?: boolean };
  const status = m.withdrawn ? "withdrawn" : m.status === "blocked" ? `blocked on ${m.waiting?.join(", ")}` : m.status === "claimed" ? `claimed by ${m.claim}` : m.status === "ready" ? "ready" : null;
  return (
    <div className="foot" style={{ marginTop: 8 }}>
      {m.lane && <span className="chip">{m.lane}</span>}
      {status && status !== "done" && <span className={`chip ${m.status === "ready" ? "good" : m.status === "claimed" ? "agent" : "warn"}`}>{status}</span>}
      {m.pr && <a href={m.pr} rel="noreferrer">PR {m.pr.split("/").at(-1)}</a>}
    </div>
  );
}

function Card({ p, canMove }: { p: ProposalRow; canMove: boolean }) {
  const pct = p.tasksTotal ? Math.round((p.tasksDone / p.tasksTotal) * 100) : 0;
  const done = p.phase === "verified" || p.phase === "released";
  return (
    <div className="tcard">
      <div className="id">{p.key}</div>
      <p>{p.title}</p>
      {p.phase !== "proposed" && p.phase !== "released" && <div className="prog"><i style={{ width: `${pct}%`, ...(done ? { background: "var(--mint)" } : {}) }} /></div>}
      <div className="foot">
        {p.phase === "released" ? <span className="chip">{p.release ?? "Released"}</span>
          : p.agent ? <span className="chip agent">{p.agent}</span> : <span className="av sm a2" title={p.ownerName ?? undefined}>{initials(p.ownerName)}</span>}
        <span>
          {p.phase === "proposed" && (p.estimateHours !== null ? `est. ${p.estimateHours} h` : `${p.hours} h`)}
          {(p.phase === "planned" || p.phase === "building") && `${p.tasksDone} of ${p.tasksTotal}${p.phase === "building" ? `, ${p.hours} h` : " tasks"}`}
          {p.phase === "verified" && <span className="chip">{p.release ?? "No release"}{p.shippedTo ? `, in ${p.shippedTo}` : ""}</span>}
          {p.phase === "released" && <span className="chip good">In Prod</span>}
        </span>
      </div>
      {p.source === "specclaw" && <SpecFacts p={p} />}
      {canMove && p.phase !== "released" && p.source !== "specclaw" && (
        <form action={moveAction}>
          <input type="hidden" name="key" value={p.key} />
          <label className="sr" htmlFor={`mv-${p.key}`}>Move {p.key} to</label>
          <select className="select" id={`mv-${p.key}`} name="to" defaultValue={p.phase}>
            {MOVABLE.map((ph) => <option key={ph} value={ph}>{PHASE_UI[ph].label}</option>)}
          </select>
          <button className="btn sm" type="submit">Move</button>
        </form>
      )}
    </div>
  );
}

export async function ProjectPage({ viewer: raw, params }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Project</h1><SignInFirst /></>;
  const data = await getProject(viewer, params.key);
  if (!data) return <><h1>Project not found</h1><p className="lede">No project with the key {params.key}.</p></>;
  const { project, proposals } = data;
  const canMove = can(viewer, "delivery:proposal:move", { projectId: project.id });
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><a href="/delivery">Projects</a><span>/</span>{project.name}</nav>
      <div className="row head">
        <div>
          <h1>{project.name}</h1>
          <p className="lede">{project.sprint ? `${project.sprint}. ${project.sprintDone} of ${project.sprintTotal} tasks done. ` : ""}Released means it reached Prod.</p>
        </div>
      </div>
      <Tabs current="board" projectKey={project.key} />
      <div className="board" style={{ marginTop: 24 }}>
        {PHASES.map((phase) => {
          const cards = proposals.filter((p) => p.phase === phase);
          return (
            <section className="lane" key={phase} aria-label={`${LANE_LABEL[phase]}, ${cards.length}`}>
              <div className="lane-head"><span className="lh"><Stk phase={phase} />{LANE_LABEL[phase]}</span> <span>{cards.length}</span></div>
              {cards.map((p) => <Card key={p.id} p={p} canMove={canMove} />)}
            </section>
          );
        })}
      </div>
    </>
  );
}
