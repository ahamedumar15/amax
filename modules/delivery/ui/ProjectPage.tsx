import { can } from "@amax/auth";
import type { ScreenProps } from "@amax/core";
import { IntentButton, PinButton } from "@amax/ui";
import { moveAction } from "../actions";
import { PHASES, type Phase } from "../contracts";
import { getProject, listEnvironments, type ProposalRow } from "../server/queries";
import { Avatar } from "./Avatar";
import { EnvironmentsCard } from "./EnvironmentsCard";
import { initials, needViewer, PHASE_UI, SignInFirst, Stk } from "./parts";
import { ProjectTabs } from "./ProjectSections";

const D = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
// "Sprint 18 runs Mon Oct 12 to Fri Oct 23. 9 of 16 tasks done, on track for v2.5.0. "
function sprintLine(p: { sprint: string | null; sprintStart: string | null; sprintEnd: string | null; health: string; nextRelease: string | null }, done: number, total: number) {
  if (!p.sprint) return "";
  const when = p.sprintStart && p.sprintEnd ? ` runs ${D(p.sprintStart, { weekday: "short", month: "short", day: "numeric" }).replace(",", "")} to ${D(p.sprintEnd, { weekday: "short", month: "short", day: "numeric" }).replace(",", "")}` : "";
  const v = p.nextRelease?.match(/v\d+(\.\d+)+/)?.[0];
  return `${p.sprint}${when}. ${done} of ${total} tasks done${v ? `, ${p.health === "on-track" ? "on track" : "at risk"} for ${v}` : ""}. `;
}

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
    <div className="tcard pinnable">
      <PinButton pin={{ label: `${p.key} ${p.title}`, tool: "list_proposals", args: { projectKey: p.projectKey } }} />
      <div className="id">{p.key}</div>
      <p>{p.title}</p>
      {p.phase !== "proposed" && p.phase !== "released" && <div className="prog"><i style={{ width: `${pct}%`, ...(done ? { background: "var(--mint)" } : {}) }} /></div>}
      <div className="foot">
        {p.phase === "released" ? <span className="chip">{p.release ?? "Released"}</span>
          : p.agent ? <span className="chip agent">{p.agent}</span> : <Avatar initials={initials(p.ownerName)} name={p.ownerName} />}
        <span>
          {p.phase === "proposed" && (p.estimateHours !== null ? `est. ${p.estimateHours} h` : `${p.hours} h`)}
          {(p.phase === "planned" || p.phase === "building") && `${p.tasksDone} of ${p.tasksTotal}${p.phase === "building" ? `, ${p.hours} h` : " tasks"}`}
          {p.phase === "verified" && p.source !== "specclaw" && <span className="chip">{p.release ?? "No release"}{p.shippedTo ? `, in ${p.shippedTo}` : ""}</span>}
          {p.phase === "verified" && p.source === "specclaw" && `${p.tasksDone} of ${p.tasksTotal} tasks`}
          {p.phase === "released" && <span className="chip good">In Prod</span>}
        </span>
      </div>
      {p.source === "specclaw" && <SpecFacts p={p} />}
      {canMove && p.phase !== "released" && p.source !== "specclaw" && (
        <details className="cardmenu">
          <summary aria-label={`Move ${p.key}`}>⋯</summary>
          <form action={moveAction}>
            <input type="hidden" name="key" value={p.key} />
            <label className="sr" htmlFor={`mv-${p.key}`}>Move {p.key} to</label>
            <select className="select" id={`mv-${p.key}`} name="to" defaultValue={p.phase}>
              {MOVABLE.map((ph) => <option key={ph} value={ph}>{PHASE_UI[ph].label}</option>)}
            </select>
            <button className="btn sm" type="submit">Move</button>
          </form>
        </details>
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
  const envs = await listEnvironments(viewer, project.key);

  // Synced projects have no sprint counters; their progress is the proposals' tasks.
  const done = project.sprintTotal ? project.sprintDone : proposals.reduce((n, p) => n + p.tasksDone, 0);
  const total = project.sprintTotal || proposals.reduce((n, p) => n + p.tasksTotal, 0);
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><a href="/delivery">Projects</a><span>/</span>{project.name}</nav>
      <div className="row head">
        <div>
          <h1>{project.name}</h1>
          <p className="lede">{sprintLine(project, done, total)}Released means it reached {envs.find((e) => e.isProd)?.name ?? "Prod"}.</p>
        </div>
        <div className="actions">
          {project.sprint && <select className="select" aria-label="Sprint" defaultValue={project.sprint}><option>{project.sprint}</option></select>}
          <IntentButton intent="delivery.new-proposal" label="New proposal" />
        </div>
      </div>
      <ProjectTabs projectKey={project.key} current="" />
      <div className="board">
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
      <EnvironmentsCard projectKey={project.key} envs={envs} canEdit={can(viewer, "delivery:release:create", { projectId: project.id })} />
    </>
  );
}
