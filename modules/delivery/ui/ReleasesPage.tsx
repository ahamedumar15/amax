import { can } from "@amax/auth";
import type { ScreenProps } from "@amax/core";
import { promoteAction } from "../actions";
import { listReleases, stageColumns, type ReleaseRow } from "../server/queries";
import { day, needViewer, SignInFirst, Tabs } from "./parts";

const HEX: Record<string, string> = { violet: "#7B61FF", amber: "#F2A93B", pink: "#F48B9B", mint: "#2FCB8C" };

/**
 * Where a release stands and what the next action is. Null means Live: only a deployed Prod record
 * says that. Stages are taken in order (gaps in positions after a removal don't end the chain); Prod
 * still testing is finished in place; a project with no Prod stage says so (final review).
 */
export function nextStep(r: ReleaseRow): { label: string; environment: string | null; primary: boolean } | null {
  const own = [...r.stages].sort((a, b) => a.position - b.position);
  if (own.some((s) => s.isProd && s.status === "deployed")) return null;
  const lastI = own.reduce((at, s, i) => (s.status ? i : at), -1);
  const last = lastI >= 0 ? own[lastI] : undefined;
  if (last?.status === "rolled-back") return { label: `Retry ${last.environment}`, environment: last.environment, primary: false };
  // A stage still testing can be promoted past (as in the mock), except Prod: that one is finished in place.
  if (last?.status === "testing" && last.isProd) return { label: `Finish ${last.environment}`, environment: last.environment, primary: true };
  const next = own[lastI + 1];
  if (next) return { label: `${last ? "Promote" : "Deploy"} to ${next.environment}`, environment: next.environment, primary: true };
  // Nothing after the last reached stage (it may sit after Prod): Prod is still the way to Live.
  const prod = own.find((s) => s.isProd);
  if (prod) {
    const verb = prod.status === "testing" ? "Finish" : prod.status === "rolled-back" ? "Retry" : "Deploy to";
    return { label: `${verb} ${prod.environment}`, environment: prod.environment, primary: prod.status !== "rolled-back" };
  }
  return { label: "No Prod stage", environment: null, primary: false };
}

function cell(s: ReleaseRow["stages"][number]) {
  if (!s.status) return <span className="muted">–</span>;
  if (s.status === "rolled-back") return <><span className="chip bad">Rolled back {day(s.at)}</span>{(s.run || s.note) && <small>{[s.run && `Run ${s.run}`, s.note].filter(Boolean).join(", ")}</small>}</>;
  if (s.status === "testing") return <span className="chip info">{day(s.at)}, testing</span>;
  return s.isProd ? <span className="chip good">{day(s.at)}</span> : <>{day(s.at)}</>;
}

/**
 * One row of the release map, always in the project's own stage order. When that order agrees with
 * the shared columns each station sits under its column; when it doesn't (projects contradict each
 * other) the row is laid out by its own order and labels its stations (review rounds 1 to 3).
 */
export function mapRow(r: ReleaseRow, columns: string[]) {
  const own = [...r.stages].sort((a, b) => a.position - b.position);
  const cols = own.map((s) => columns.indexOf(s.environment));
  const agrees = cols.every((c, i) => c >= 0 && (i === 0 || c > cols[i - 1]));
  const slot = (i: number) => (agrees ? cols[i] : i);
  const lastReached = own.reduce((last, s, i) => (s.status ? i : last), -1);
  return {
    agrees,
    stations: own.map((s, i) => ({ environment: s.environment, slot: slot(i), reached: Boolean(s.status), last: i === lastReached })),
    lineTo: lastReached >= 0 ? slot(lastReached) : null,
    aheadTo: own.length ? slot(own.length - 1) : null,
    back: lastReached >= 0 && own[lastReached].status === "rolled-back",
  };
}

function ReleaseMap({ releases, columns }: { releases: ReleaseRow[]; columns: string[] }) {
  const active = releases.filter((r) => r.stages.some((s) => s.status));
  const x = (i: number) => 300 + i * 180;
  const h = 70 * active.length + 60;
  return (
    <svg viewBox={`0 0 ${Math.max(900, x(columns.length - 1) + 60)} ${h}`} role="img" aria-label={active.map((r) => `${r.projectName} ${r.version}: ${mapRow(r, columns).stations.find((s) => s.last)?.environment ?? "not deployed"}`).join(". ")}>
      <g className="env" textAnchor="middle">{columns.map((e, i) => <text key={e} x={x(i)} y={20}>{e}</text>)}</g>
      <g stroke="var(--line)" strokeWidth={1.5}>{columns.map((e, i) => <line key={e} x1={x(i)} y1={34} x2={x(i)} y2={h - 8} />)}</g>
      {active.map((r, row) => {
        const y = 86 + row * 70;
        const c = HEX[r.projectColor] ?? "#7B61FF";
        const m = mapRow(r, columns);
        const lastI = m.lineTo!;
        return (
          <g key={r.id}>
            <text className="lbl" x={0} y={y + 5}>{r.projectName}</text>
            <text className="cap" x={0} y={y + 24}>{r.version}, {r.proposals} proposals{m.agrees ? "" : ", own stage order"}</text>
            <path className="line" d={`M240 ${y}H${x(lastI) - (m.back ? 12 : 0)}`} stroke={c} />
            {m.aheadTo !== null && lastI < m.aheadTo && <path className="ahead" d={`M${x(lastI) + (m.back ? 12 : 0)} ${y}H${x(m.aheadTo)}`} stroke={c} />}
            {m.stations.map((s) => (
              <g key={s.environment}>
                {s.last && m.back ? <circle cx={x(s.slot)} cy={y} r={13} fill="#F26B5B" />
                  : <circle className="station" cx={x(s.slot)} cy={y} r={s.last ? 11 : 9} stroke={s.reached ? c : "var(--line-2)"} />}
                {!m.agrees && <text className="cap" textAnchor="middle" x={x(s.slot)} y={y + 28}>{s.environment}</text>}
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export async function ReleasesPage({ viewer: raw }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Releases</h1><SignInFirst /></>;
  const releases = await listReleases(viewer);
  // 042: projects have their own environments; columns are the union in stage order.
  const envs = stageColumns(releases);
  return (
    <>
      <h1>Releases</h1>
      <p className="lede">A release moves when a pipeline reports a deployment, when an agent records one, or when you promote it here.</p>
      <Tabs current="releases" />
      <div className="card map scroll-x" style={{ margin: "24px 0 28px" }}>
        <div className="card-head"><h2>Release map</h2></div>
        <ReleaseMap releases={releases} columns={envs} />
      </div>
      <div className="card flush">
        <div className="card-head"><h2>All releases</h2></div>
        <div className="scroll-x">
          <table className="tbl">
            <caption className="sr">All releases</caption>
            <thead><tr><th>Release</th><th>Project</th><th className="num">Proposals</th>{envs.map((e) => <th key={e}>{e}</th>)}<th className="num">Action</th></tr></thead>
            <tbody>
              {releases.map((r) => {
                const step = nextStep(r);
                // Per project: a PM elsewhere, Finance or Leadership see the stage, not a button.
                const allowed = can(viewer, "delivery:deployment:record", { projectId: r.projectId });
                return (
                  <tr key={r.id}>
                    <td data-label="Release"><a className="rowlink" href={`/delivery/releases/${r.projectKey}/${encodeURIComponent(r.version)}`}><b>{r.version}</b></a></td>
                    <td data-label="Project"><span className="dot" style={{ background: `var(--${r.projectColor})` }} />{r.projectName}</td>
                    <td data-label="Proposals" className="num">{r.proposals}</td>
                    {envs.map((e) => { const s = r.stages.find((x) => x.environment === e); return <td key={e} data-label={e}>{s ? cell(s) : <span className="muted" title="Not an environment of this project">n/a</span>}</td>; })}
                    <td data-label="" className="num">
                      {!step ? <span className="muted">Live</span> : !step.environment ? <span className="muted">{step.label}</span> : !allowed ? <span className="muted">{r.stages.some((s) => s.status) ? step.label.replace(/^(Promote|Deploy|Retry|Finish) /, "Next: ") : "Building"}</span> : (
                        <form action={promoteAction}>
                          <input type="hidden" name="projectKey" value={r.projectKey} />
                          <input type="hidden" name="version" value={r.version} />
                          <input type="hidden" name="environment" value={step.environment ?? ""} />
                          <button className={`btn sm${step.primary ? " primary" : ""}`} type="submit">{step.label}</button>
                        </form>
                      )}
                    </td>
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
