import { can } from "@amax/auth";
import type { ScreenProps } from "@amax/core";
import { promoteAction } from "../actions";
import { listReleases, type ReleaseRow } from "../server/queries";
import { day, needViewer, SignInFirst, Tabs } from "./parts";

const HEX: Record<string, string> = { violet: "#7B61FF", amber: "#F2A93B", pink: "#F48B9B", mint: "#2FCB8C" };

// Where a release stands and what the next action is.
export function nextStep(r: ReleaseRow): { label: string; environment: string; primary: boolean } | null {
  const reached = r.stages.filter((s) => s.status);
  const last = reached.at(-1);
  if (last?.status === "rolled-back") return { label: `Retry ${last.environment}`, environment: last.environment, primary: false };
  if (last?.isProd && last.status === "deployed") return null;
  const next = r.stages.find((s) => s.position === (last?.position ?? 0) + 1);
  return next ? { label: `${last ? "Promote" : "Deploy"} to ${next.environment}`, environment: next.environment, primary: true } : null;
}

function cell(s: ReleaseRow["stages"][number]) {
  if (!s.status) return <span className="muted">–</span>;
  if (s.status === "rolled-back") return <><span className="chip bad">Rolled back {day(s.at)}</span>{(s.run || s.note) && <small>{[s.run && `Run ${s.run}`, s.note].filter(Boolean).join(", ")}</small>}</>;
  if (s.status === "testing") return <span className="chip info">{day(s.at)}, testing</span>;
  return s.isProd ? <span className="chip good">{day(s.at)}</span> : <>{day(s.at)}</>;
}

function ReleaseMap({ releases }: { releases: ReleaseRow[] }) {
  const active = releases.filter((r) => r.stages.some((s) => s.status));
  const envs = releases[0]?.stages ?? [];
  const x = (i: number) => 300 + i * 180;
  const h = 70 * active.length + 60;
  return (
    <svg viewBox={`0 0 900 ${h}`} role="img" aria-label={active.map((r) => `${r.projectName} ${r.version}: ${r.stages.filter((s) => s.status).at(-1)?.environment ?? "not deployed"}`).join(". ")}>
      <g className="env" textAnchor="middle">{envs.map((e, i) => <text key={e.environment} x={x(i)} y={20}>{e.environment}</text>)}</g>
      <g stroke="var(--line)" strokeWidth={1.5}>{envs.map((e, i) => <line key={e.environment} x1={x(i)} y1={34} x2={x(i)} y2={h - 8} />)}</g>
      {active.map((r, row) => {
        const y = 86 + row * 70;
        const c = HEX[r.projectColor] ?? "#7B61FF";
        const reached = r.stages.filter((s) => s.status);
        const lastI = r.stages.indexOf(reached.at(-1)!);
        const back = reached.at(-1)?.status === "rolled-back";
        return (
          <g key={r.id}>
            <text className="lbl" x={0} y={y + 5}>{r.projectName}</text>
            <text className="cap" x={0} y={y + 24}>{r.version}, {r.proposals} proposals</text>
            <path className="line" d={`M240 ${y}H${x(lastI) - (back ? 12 : 0)}`} stroke={c} />
            {lastI < envs.length - 1 && <path className="ahead" d={`M${x(lastI) + (back ? 12 : 0)} ${y}H${x(envs.length - 1)}`} stroke={c} />}
            {r.stages.map((s, i) =>
              i === lastI && back ? <circle key={i} cx={x(i)} cy={y} r={13} fill="#F26B5B" />
                : <circle key={i} className="station" cx={x(i)} cy={y} r={i === lastI ? 11 : 9} stroke={s.status ? c : "var(--line-2)"} />)}
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
  const envs = releases[0]?.stages.map((s) => s.environment) ?? ["Dev", "QA", "UAT", "Prod"];
  return (
    <>
      <h1>Releases</h1>
      <p className="lede">A release moves when a pipeline reports a deployment, when an agent records one, or when you promote it here.</p>
      <Tabs current="releases" />
      <div className="card map scroll-x" style={{ margin: "24px 0 28px" }}>
        <div className="card-head"><h2>Release map</h2></div>
        <ReleaseMap releases={releases} />
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
                const allowed = can(viewer, "delivery:deployment:record", {});
                return (
                  <tr key={r.id}>
                    <td data-label="Release"><b>{r.version}</b></td>
                    <td data-label="Project"><span className="dot" style={{ background: `var(--${r.projectColor})` }} />{r.projectName}</td>
                    <td data-label="Proposals" className="num">{r.proposals}</td>
                    {r.stages.map((s) => <td key={s.environment} data-label={s.environment}>{cell(s)}</td>)}
                    <td data-label="" className="num">
                      {!step ? <span className="muted">Live</span> : !r.stages.some((s) => s.status) && r.proposals > 0 && !allowed ? <span className="muted">Building</span> : (
                        <form action={promoteAction}>
                          <input type="hidden" name="projectKey" value={r.projectKey} />
                          <input type="hidden" name="version" value={r.version} />
                          <input type="hidden" name="environment" value={step.environment} />
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
