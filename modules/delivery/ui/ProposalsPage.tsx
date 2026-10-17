import type { ScreenProps } from "@amax/core";
import { PHASES, type Phase } from "../contracts";
import { listProposals, phaseCounts } from "../server/queries";
import { COLOR, needViewer, PHASE_UI, PhaseChip, SignInFirst, Stk, Tabs } from "./parts";

const FILTERS: (Phase | "all")[] = ["all", "proposed", "planned", "building", "verified", "released"];

export async function ProposalsPage({ viewer: raw, params }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Proposals</h1><SignInFirst /></>;
  const phase = (PHASES as readonly string[]).includes(params.phase ?? "") ? (params.phase as Phase) : undefined;
  const [counts, rows] = await Promise.all([phaseCounts(viewer), listProposals(viewer, { phase })]);
  const bar: [Phase, number, string][] = [["proposed", counts.proposed, "Proposed"], ["planned", counts.planned, "Planned"], ["building", counts.building, "Building"], ["verified", counts.verified, "Verified"], ["released", counts.releasedThisMonth, "Released this month"]];
  return (
    <>
      <h1>Proposals</h1>
      <p className="lede">Every specclaw change across your projects, with the time spent on it and how far it has shipped.</p>
      <Tabs current="proposals" />
      <div className="card" style={{ margin: "24px 0 28px" }}>
        <div className="card-head"><h2>Proposals by phase</h2><span className="muted" style={{ fontSize: 13 }}>{counts.inFlight} in flight</span></div>
        <div className="phasebar" role="img" aria-label={bar.map(([, n, l]) => `${l} ${n}`).join(", ")}>
          {bar.map(([p, n]) => n > 0 && <i key={p} style={{ flex: n, background: PHASE_UI[p].color }} />)}
        </div>
        <ul className="phase-legend">
          {bar.map(([p, n, l]) => <li key={p}><Stk phase={p} />{l}<b>{n}</b></li>)}
        </ul>
      </div>
      <div className="card flush">
        <div className="card-head">
          <nav className="seg" aria-label="Phase">
            {FILTERS.map((f) => (
              <a key={f} className="btn sm" href={f === "all" ? "/delivery/proposals" : `/delivery/proposals/${f}`} aria-current={(f === "all" ? !phase : phase === f) ? "true" : undefined}>
                {f === "all" ? "All" : PHASE_UI[f].label}
              </a>
            ))}
          </nav>
          <span className="muted" style={{ fontSize: 13 }}>{rows.length} shown</span>
        </div>
        <div className="scroll-x">
          <table className="tbl">
            <caption className="sr">Proposals</caption>
            <thead><tr><th>Proposal</th><th>Project</th><th>Phase</th><th>Tasks</th><th className="num">Time</th><th>Release</th><th>Shipped to</th><th>Owner</th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const pct = p.tasksTotal ? Math.round((p.tasksDone / p.tasksTotal) * 100) : 0;
                return (
                  <tr key={p.id}>
                    <td data-label="Proposal"><b>{p.key}</b> {p.title}</td>
                    <td data-label="Project"><span className="dot" style={{ background: COLOR[p.projectColor] }} />{p.projectName}</td>
                    <td data-label="Phase"><PhaseChip phase={p.phase} /></td>
                    <td data-label="Tasks">{p.tasksTotal ? <div className="meter" role="img" aria-label={`${p.tasksDone} of ${p.tasksTotal} tasks`}><i style={{ width: `${pct}%`, background: pct === 100 ? "var(--mint)" : "var(--violet)" }} /></div> : <span className="muted">–</span>}</td>
                    <td data-label="Time" className="num">{p.hours.toFixed(1)} h</td>
                    <td data-label="Release">{p.release ?? <span className="muted">None</span>}</td>
                    <td data-label="Shipped to">{p.phase === "released" ? <span className="chip good">Prod</span> : p.shippedTo ? p.shippedTo : <span className="muted">Not yet</span>}</td>
                    <td data-label="Owner">{p.ownerName ?? "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
