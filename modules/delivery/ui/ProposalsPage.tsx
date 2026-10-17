import type { ScreenProps } from "@amax/core";
import { PinButton } from "@amax/ui";
import { PHASES, type Phase } from "../contracts";
import { listProjects, listProposals, phaseCounts, shippedPerWeek } from "../server/queries";
import { BarChart } from "./charts";
import { FilterMenu } from "./FilterMenu";
import { COLOR, needViewer, PHASE_UI, PhaseChip, SignInFirst, Stk } from "./parts";

const FILTERS: (Phase | "all")[] = ["all", "proposed", "building", "verified", "released"];
const PAGE = 5;

const csv = (rows: string[][]) => `data:text/csv;charset=utf-8,${encodeURIComponent(rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n"))}`;

export async function ProposalsPage({ viewer: raw, params, searchParams = {} }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Proposals</h1><SignInFirst /></>;
  const phase = (PHASES as readonly string[]).includes(params.phase ?? "") ? (params.phase as Phase) : undefined;
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  const [counts, rows, shipped, projects] = await Promise.all([phaseCounts(viewer), listProposals(viewer, { phase, projectKey: searchParams.project }), shippedPerWeek(viewer), listProjects(viewer, "active")]);
  const bar: [Phase, number, string][] = [["proposed", counts.proposed, "Proposed"], ["planned", counts.planned, "Planned"], ["building", counts.building, "Building"], ["verified", counts.verified, "Verified"], ["released", counts.releasedThisMonth, "Released this month"]];
  const recent = shipped.values.slice(-4).reduce((a, b) => a + b, 0), prior = shipped.values.slice(0, 4).reduce((a, b) => a + b, 0);
  const trend = prior ? ((recent - prior) / prior) * 100 : null;
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const base = phase ? `/delivery/proposals/${phase}` : "/delivery/proposals";
  const href = (p: number) => `${base}?${new URLSearchParams({ ...(searchParams.project ? { project: searchParams.project } : {}), page: String(p) })}`;
  return (
    <>
      <h1>Proposals</h1>
      <p className="lede">Every specclaw change across your projects, with the time spent on it and how far it has shipped.</p>
      <div className="cols even" style={{ marginBottom: 28 }}>
        <div className="card pinnable">
          <div className="card-head"><h2>Proposals by phase</h2><PinButton inline pin={{ label: "Proposals by phase", tool: "list_proposals", args: {} }} /><span className="muted" style={{ fontSize: 13 }}>{counts.inFlight} in flight</span></div>
          <div className="phasebar" role="img" aria-label={bar.map(([, n, l]) => `${l} ${n}`).join(", ")}>
            {bar.map(([p, n]) => n > 0 && <i key={p} style={{ flex: n, background: PHASE_UI[p].color }} />)}
          </div>
          <ul className="phase-legend">{bar.map(([p, n, l]) => <li key={p}><Stk phase={p} />{l}<b>{n}</b></li>)}</ul>
        </div>
        <div className="card pinnable">
          <div className="card-head"><h2>Shipped to Prod per week</h2><PinButton inline pin={{ label: "Shipped to Prod per week", tool: "list_proposals", args: {} }} />{trend !== null && <span className={trend >= 0 ? "up" : "muted"}>{trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}%</span>}</div>
          <BarChart label="Proposals shipped to Prod per week" labels={shipped.labels} values={shipped.values} max={Math.max(8, Math.ceil(Math.max(...shipped.values) / 2) * 2)} />
        </div>
      </div>
      <div className="card flush pinnable">
        <div className="card-head">
          <nav className="seg" aria-label="Phase">
            {FILTERS.map((f) => (
              <a key={f} href={f === "all" ? "/delivery/proposals" : `/delivery/proposals/${f}`} aria-current={(f === "all" ? !phase : phase === f) ? "true" : undefined}>{f === "all" ? "All" : PHASE_UI[f].label}</a>
            ))}
          </nav>
          <div className="actions">
            <FilterMenu label="Filter by project" options={[{ key: "", name: "All projects" }, ...projects].map((p) => ({ text: p.name, current: (searchParams.project ?? "") === p.key, href: `${base}${p.key ? `?project=${p.key}` : ""}` }))} />
            <a className="btn" href={csv([["Proposal", "Title", "Project", "Phase", "Tasks done", "Tasks", "Hours", "Release", "Shipped to", "Owner"], ...rows.map((p) => [p.key, p.title, p.projectName, p.phase, String(p.tasksDone), String(p.tasksTotal), String(p.hours), p.release ?? "", p.phase === "released" ? "Prod" : p.shippedTo ?? "", p.ownerName ?? ""])])} download="proposals.csv">
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
                    <td data-label="Proposal"><b>{p.key}</b> {p.title}</td>
                    <td data-label="Project"><span className="dot" style={{ background: COLOR[p.projectColor] }} />{p.projectName}</td>
                    <td data-label="Phase"><PhaseChip phase={p.phase} /></td>
                    <td data-label="Tasks">{p.tasksTotal && p.phase !== "proposed" ? <div className="meter" role="img" aria-label={`${p.tasksDone} of ${p.tasksTotal} tasks`}><i style={{ width: `${pct}%`, background: pct === 100 ? "var(--mint)" : "var(--violet)" }} /></div> : <span className="muted">–</span>}</td>
                    <td data-label="Time" className="num">{p.hours.toFixed(1)} h</td>
                    <td data-label="Release">{p.release ?? <span className="muted">None</span>}</td>
                    <td data-label="Shipped to">{p.phase === "released" ? <span className="chip good">Prod</span> : p.shippedTo ? p.shippedTo : <span className="muted">Not yet</span>}</td>
                    <td data-label="Owner">{p.ownerName ?? "–"}<PinButton pin={{ label: `${p.key} ${p.title}`, tool: "get_project", args: { key: p.projectKey } }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <nav className="row" aria-label="Pages" style={{ padding: "14px 28px 24px" }}>
          <span className="muted" style={{ fontSize: 13 }}>{rows.length ? `${(page - 1) * PAGE + 1}–${Math.min(page * PAGE, rows.length)} of ${rows.length}` : "No proposals"}</span>
          <span className="actions">
            {page > 1 && <a className="btn sm" href={href(page - 1)}>Previous</a>}
            {page * PAGE < rows.length && <a className="btn sm" href={href(page + 1)}>Next</a>}
          </span>
        </nav>
      </div>
    </>
  );
}
