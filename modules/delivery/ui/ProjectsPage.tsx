import type { ScreenProps } from "@amax/core";
import { Ticket } from "@amax/ui";
import { listProjects } from "../server/queries";
import { COLOR, initials, needViewer, shortName, SignInFirst, Tabs, usd } from "./parts";

const HEALTH: Record<string, [string, string]> = { "on-track": ["good", "On track"], "at-risk": ["bad", "At risk"], "off-track": ["bad", "Off track"] };
const BILLING: Record<string, string> = { fixed: "fixed price", "t&m": "time and materials", retainer: "retainer", internal: "internal" };

export async function ProjectsPage({ viewer: raw }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Projects</h1><SignInFirst /></>;
  const projects = await listProjects(viewer);
  const value = projects.reduce((n, p) => n + (p.contractValue ?? 0), 0);
  const invoiced = projects.reduce((n, p) => n + (p.invoiced ?? 0), 0);
  const margin = value ? projects.reduce((n, p) => n + (p.marginPct ?? 0) * (p.contractValue ?? 0), 0) / value : 0;
  const atRisk = projects.filter((p) => p.health !== "on-track");
  const clients = new Set(projects.map((p) => p.client)).size;
  return (
    <>
      <div className="row head">
        <div>
          <h1>Projects</h1>
          <p className="lede">{projects.length} active projects for {clients} clients.{atRisk.length ? ` ${atRisk.map((p) => p.name).join(", ")} ${atRisk.length > 1 ? "are" : "is"} at risk.` : ""}</p>
        </div>
      </div>
      <Tabs current="board" />
      <div className="tickets four" style={{ marginTop: 24 }}>
        <Ticket tone="info" label="Active projects" value={String(projects.length)} note={`${clients} clients`} />
        <Ticket tone="info" label="Contract value" value={usd(value)} progress={{ percent: value ? (invoiced / value) * 100 : 0, label: `${value ? Math.round((invoiced / value) * 100) : 0}% of ${usd(value)} invoiced` }} />
        <Ticket tone="good" label="Average margin" value={`${margin.toFixed(1)}%`} note="Revenue-weighted, target 35%" />
        <Ticket tone="problem" label="At risk" value={`${atRisk.length} project${atRisk.length === 1 ? "" : "s"}`} note={atRisk.map((p) => `${p.name}${p.riskPct ? `, ${p.riskPct}% risk` : ""}`).join("; ") || "None"} />
      </div>
      <div className="card flush">
        <div className="card-head"><h2>Portfolio</h2></div>
        <div className="scroll-x">
          <table className="tbl">
            <caption className="sr">Portfolio</caption>
            <thead><tr><th>Project</th><th>Manager</th><th>Sprint</th><th style={{ minWidth: 170 }}>Progress</th><th>Health</th><th className="num">Margin</th><th>Next release</th><th className="num"><span className="sr">Actions</span></th></tr></thead>
            <tbody>
              {projects.map((p) => {
                const pct = p.sprintTotal ? Math.round((p.sprintDone / p.sprintTotal) * 100) : 0;
                const [tone, label] = HEALTH[p.health];
                return (
                  <tr key={p.id}>
                    <td data-label="Project"><a className="rowlink" href={`/delivery/p/${p.key}`}><span className="dot" style={{ background: COLOR[p.color] }} /><b>{p.name}</b></a><small>{p.client}, {BILLING[p.billing]}</small></td>
                    <td data-label="Manager"><div className="who"><span className="av sm a1">{initials(p.managerName)}</span>{shortName(p.managerName)}</div></td>
                    <td data-label="Sprint">{p.sprint ?? "–"}</td>
                    <td data-label="Progress"><div className="row"><div className="meter" style={{ flex: 1 }}><i style={{ width: `${pct}%`, background: p.health === "on-track" && pct > 75 ? "var(--mint)" : COLOR[p.color] }} /></div>{p.sprintDone} of {p.sprintTotal}</div></td>
                    <td data-label="Health"><span className={`chip ${tone}`}>{label}</span></td>
                    <td data-label="Margin" className="num">{p.marginPct === null ? "–" : `${p.marginPct.toFixed(1)}%`}</td>
                    <td data-label="Next release">{p.nextRelease ?? "–"}</td>
                    <td data-label="" className="num"><a className="btn sm" href={`/delivery/p/${p.key}`}>Open board</a></td>
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
