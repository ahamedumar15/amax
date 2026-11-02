import type { ScreenProps } from "@amax/core";
import { canEver } from "@amax/auth";
import { PinButton } from "@amax/ui";
import { PHASES, proposalHref, type Phase } from "../contracts";
import { metricsPin, projectPin, proposalPin } from "../pins";
import { listProjects, listProposals, phaseCounts, shippedPerWeek, type ProposalRow } from "../server/queries";
import { BarChart } from "./charts";
import { csvHref } from "./csv";
import { FilterMenu } from "./FilterMenu";
import { NewProposalButton } from "./NewProposalButton";
import { COLOR, needViewer, PHASE_UI, PhaseChip, SignInFirst, Stk } from "./parts";
import { ProposalPage } from "./ProposalPage";
import { ProposalSearch } from "./ProposalSearch";

// 081 AC-15: every phase of the lifecycle, Planned included.
const FILTERS: (Phase | "all")[] = ["all", ...PHASES];
const PAGE = 20;

export async function ProposalsPage({ viewer: raw, params, searchParams = {} }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Proposals</h1><SignInFirst /></>;
  // 081: /delivery/proposals/:key shares the segment with the phase filter; anything that isn't a phase is a key.
  if (params.phase && !(PHASES as readonly string[]).includes(params.phase)) return ProposalPage({ viewer, proposalKey: decodeURIComponent(params.phase) });
  const phase = (PHASES as readonly string[]).includes(params.phase ?? "") ? (params.phase as Phase) : undefined;
  const asked = Math.max(1, Number(searchParams.page ?? 1) || 1);
  // 081 AC-16: the cards and the table read through one filter, so they always agree.
  const projectKey = searchParams.project || undefined;
  const [counts, rows, shipped, projects] = await Promise.all([phaseCounts(viewer, undefined, { projectKey }), listProposals(viewer, { phase, projectKey, q: searchParams.q }),
    shippedPerWeek(viewer, undefined, { projectKey }), listProjects(viewer, "active")]);
  const bar: [Phase, number, string][] = [["proposed", counts.proposed, "Proposed"], ["planned", counts.planned, "Planned"], ["building", counts.building, "Building"], ["verified", counts.verified, "Verified"], ["released", counts.releasedThisMonth, "Released this month"]];
  const recent = shipped.values.slice(-4).reduce((a, b) => a + b, 0), prior = shipped.values.slice(0, 4).reduce((a, b) => a + b, 0);
  const trend = prior ? ((recent - prior) / prior) * 100 : null;
  const filtered = projects.find((p) => p.key === searchParams.project);
  return (
    <>
      <div className="row head">
        <div><h1>Proposals</h1><p className="lede">Every specclaw change across your projects, with the time spent on it and how far it has shipped.</p></div>
        {canEver(viewer, "delivery:proposal:create") && <div className="actions"><NewProposalButton project={filtered ? { pin: projectPin(filtered), name: filtered.name } : undefined} /></div>}
      </div>
      <div className="cols even" style={{ marginBottom: 28 }}>
        <div className="card pinnable">
          <div className="card-head"><h2>Proposals by phase</h2><PinButton inline pin={metricsPin("Proposals by phase", filtered)} /><span className="muted" style={{ fontSize: 13 }}>{counts.inFlight} in flight</span></div>
          <div className="phasebar" role="img" aria-label={bar.map(([, n, l]) => `${l} ${n}`).join(", ")}>
            {bar.map(([p, n]) => n > 0 && <i key={p} style={{ flex: n, background: PHASE_UI[p].color }} />)}
          </div>
          <ul className="phase-legend">{bar.map(([p, n, l]) => <li key={p}><Stk phase={p} />{l}<b>{n}</b></li>)}</ul>
        </div>
        <div className="card pinnable">
          <div className="card-head"><h2>Shipped to Prod per week</h2><PinButton inline pin={metricsPin("Shipped to Prod per week", filtered)} />{trend !== null && <span className={trend >= 0 ? "up" : "down"}>{trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}%</span>}</div>
          <BarChart label="Proposals shipped to Prod per week" labels={shipped.labels} values={shipped.values} max={Math.max(8, Math.ceil(Math.max(...shipped.values) / 2) * 2)} />
        </div>
      </div>
      <ProposalsTable rows={rows} phase={phase} root="/delivery/proposals" project={projectKey} q={searchParams.q} page={asked} projects={projects} />
    </>
  );
}

/**
 * The proposals table with its phase filters, export and pages (051): the global list and a
 * project's Proposals section share it. `root` is the list's path; `projects` adds the project filter.
 */
export function ProposalsTable({ rows, phase, root, project, q, page: asked, projects, title }: { rows: ProposalRow[]; phase?: Phase; root: string; project?: string; q?: string; page: number; projects?: { key: string; name: string }[]; title?: string }) {
  const page = Math.min(asked, Math.max(1, Math.ceil(rows.length / PAGE)));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const base = phase ? `${root}/${phase}` : root;
  // Filters, search and pages keep each other: a link changes one of them and carries the rest.
  const query = (o: { project?: string; q?: string; page?: number }) => { const s = new URLSearchParams(Object.entries(o).filter(([, x]) => x).map(([k, x]) => [k, String(x)])).toString(); return s ? `?${s}` : ""; };
  const href = (p: number) => `${base}${query({ project, q, page: p })}`;
  return (
    <div className="card flush pinnable">
      <div className="card-head">
        {title && <h2>{title}</h2>}
        <nav className="seg" aria-label="Phase">
          {FILTERS.map((f) => (
            <a key={f} href={`${f === "all" ? root : `${root}/${f}`}${query({ project, q })}`} aria-current={(f === "all" ? !phase : phase === f) ? "true" : undefined}>{f === "all" ? "All" : PHASE_UI[f].label}</a>
          ))}
        </nav>
        <div className="actions">
          {projects && <FilterMenu label="Filter by project" options={[{ key: "", name: "All projects" }, ...projects].map((p) => ({ text: p.name, current: (project ?? "") === p.key, href: `${base}${query({ project: p.key, q })}` }))} />}
          <ProposalSearch base={base} project={project} q={q} />
          <a className="btn" href={csvHref([["Proposal", "Title", "Project", "Phase", "Tasks done", "Tasks", "Hours", "Release", "Shipped to", "Owner"], ...rows.map((p) => [p.key, p.title, p.projectName, p.phase, String(p.tasksDone), String(p.tasksTotal), String(p.hours), p.release ?? "", p.phase === "released" ? "Prod" : p.shippedTo ?? "", p.ownerName ?? ""])])} download="proposals.csv">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-4-4 4 4 4-4M5 20h14" /></svg>Export
          </a>
        </div>
      </div>
      <div className="scroll-x">
        <table className="tbl">
          <caption className="sr">Proposals</caption>
          <thead><tr><th>Proposal</th><th>Project</th><th>Phase</th><th>Tasks</th><th className="num">Time</th><th>Release</th><th>Shipped to</th><th>Owner</th></tr></thead>
          <tbody>
            {shown.map((p) => {
              const pct = p.tasksTotal ? Math.round((p.tasksDone / p.tasksTotal) * 100) : 0;
              return (
                <tr key={p.id} className="pinnable">
                  <td data-label="Proposal"><a href={proposalHref(p.key)}><b>{p.key}</b> {p.title}</a></td>
                  <td data-label="Project"><span className="dot" style={{ background: COLOR[p.projectColor] }} />{p.projectName}</td>
                  <td data-label="Phase"><PhaseChip phase={p.phase} /></td>
                  <td data-label="Tasks">{p.tasksTotal && p.phase !== "proposed" ? <div className="meter" role="img" aria-label={`${p.tasksDone} of ${p.tasksTotal} tasks`}><i style={{ width: `${pct}%`, background: pct === 100 ? "var(--mint)" : "var(--violet)" }} /></div> : <span className="muted">–</span>}</td>
                  <td data-label="Time" className="num">{Number(p.hours.toFixed(2))} h</td>
                  <td data-label="Release">{p.release ?? <span className="muted">None</span>}</td>
                  <td data-label="Shipped to">{p.phase === "released" ? <span className="chip good">Prod</span> : p.shippedTo ? p.shippedTo : <span className="muted">Not yet</span>}</td>
                  <td data-label="Owner">{p.ownerName ?? <span className="muted">Unassigned</span>}<PinButton pin={proposalPin(p)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <nav className="row" aria-label="Pages" style={{ padding: "14px 28px 24px" }}>
        <span className="muted" style={{ fontSize: 13 }}>{rows.length ? `${(page - 1) * PAGE + 1}–${Math.min(page * PAGE, rows.length)} of ${rows.length}` : q ? `No proposals match “${q}”` : "No proposals"}</span>
        <span className="actions">
          {page > 1 && <a className="btn sm" href={href(page - 1)}>Previous</a>}
          {page * PAGE < rows.length && <a className="btn sm" href={href(page + 1)}>Next</a>}
        </span>
      </nav>
    </div>
  );
}
