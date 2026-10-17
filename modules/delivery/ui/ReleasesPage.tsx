import { can } from "@amax/auth";
import type { ScreenProps } from "@amax/core";
import { promoteAction } from "../actions";
import { listReleases, today, type ReleaseRow } from "../server/queries";
import { day, needViewer, SignInFirst } from "./parts";

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

const dayName = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).replace(",", "");

// The mock's release map: one line per active release, stations per environment, and a pill that
// says where it stands ("Testing since Oct 15", "Rolled back Wed Oct 14", "Live since Oct 1").
function ReleaseMap({ releases }: { releases: ReleaseRow[] }) {
  const envs = releases[0]?.stages ?? [];
  const x = (i: number) => 300 + i * 180;
  const h = 70 * releases.length + 60;
  return (
    <svg viewBox={`0 0 900 ${h}`} role="img" aria-label={releases.map((r) => { const last = r.stages.filter((s) => s.status).at(-1); return `${r.projectName} ${r.version} ${last ? (last.status === "rolled-back" ? `was rolled back from ${last.environment}` : last.status === "testing" ? `is in ${last.environment}` : `is in ${last.environment}`) : "isn't deployed"}`; }).join(". ") + "."}>
      <g className="env" textAnchor="middle">{envs.map((e, i) => <text key={e.environment} x={x(i)} y={20}>{e.environment}</text>)}</g>
      <g stroke="var(--line)" strokeWidth={1.5}>{envs.map((e, i) => <line key={e.environment} x1={x(i)} y1={34} x2={x(i)} y2={h - 8} />)}</g>
      {releases.map((r, row) => {
        const y = 86 + row * 70;
        const c = HEX[r.projectColor] ?? "#7B61FF";
        const reached = r.stages.filter((s) => s.status);
        const lastStage = reached.at(-1)!;
        const li = r.stages.indexOf(lastStage);
        const back = lastStage.status === "rolled-back";
        const live = lastStage.isProd && lastStage.status === "deployed";
        const pill = back ? { text: `Rolled back ${dayName(lastStage.at!)}`, fill: "#FDE7E4", ink: "#C2412F", w: 128 }
          : live ? { text: `Live since ${day(lastStage.at)}`, fill: "#E3F8EF", ink: "#14845A", w: 118 }
          : lastStage.status === "testing" ? { text: `Testing since ${day(lastStage.at)}`, fill: "#ECE8FF", ink: "#5B44D6", w: 132 }
          : { text: `In ${lastStage.environment} since ${day(lastStage.at)}`, fill: "#ECE8FF", ink: "#5B44D6", w: 150 };
        const px = live ? x(li) - 144 : x(li) + (back ? 26 : 26);
        const py = live ? y - 30 : y - 14;
        return (
          <g key={r.id}>
            <text className="lbl" x={0} y={y + 5}>{r.projectName}</text>
            <text className="cap" x={0} y={y + 24}>{r.version}, {r.proposals} proposals</text>
            <path className="line" pathLength={1} d={`M240 ${y}H${x(li) - (back ? 12 : 0)}`} stroke={c} />
            {li < envs.length - 1 && <path className="ahead" d={`M${x(li) + (back ? 12 : 0)} ${y}H${x(envs.length - 1)}`} stroke={c} />}
            {r.stages.map((s, i) => {
              if (i === li && back) return <g key={i}><circle cx={x(i)} cy={y} r={13} fill="#F26B5B" /><path d={`m${x(i) - 5} ${y - 5} 10 10m0-10-10 10`} stroke="#fff" strokeWidth={2.6} strokeLinecap="round" /></g>;
              if (i === li && live) return <g key={i}><circle cx={x(i)} cy={y} r={13} fill={c} /><circle cx={x(i)} cy={y} r={5} fill="#fff" /></g>;
              if (i === li) return <g key={i}><circle className="station" cx={x(i)} cy={y} r={11} stroke={c} /><circle cx={x(i)} cy={y} r={4.5} fill={c} /></g>;
              return <circle key={i} className="station" cx={x(i)} cy={y} r={s.status ? 9 : 8} stroke={s.status ? c : "var(--line-2)"} />;
            })}
            <rect x={px} y={py} width={pill.w} height={live ? 24 : 28} rx={live ? 9 : 10} fill={pill.fill} />
            <text x={px + pill.w / 2} y={py + (live ? 17 : 19)} textAnchor="middle" fill={pill.ink} fontSize={live ? 12 : 12.5} fontWeight={600} fontFamily="Avenir Next,system-ui">{pill.text}</text>
          </g>
        );
      })}
    </svg>
  );
}

export async function ReleasesPage({ viewer: raw, searchParams }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Releases</h1><SignInFirst /></>;
  const releases = await listReleases(viewer);
  // 042: projects have their own environments; columns are the union in stage order.
  const envs = [...new Map(releases.flatMap((r) => r.stages).sort((a, b) => a.position - b.position).map((s) => [s.environment, s.environment])).keys()];
  return (
    <>
      <h1>Releases</h1>
      <p className="lede">A release moves when a pipeline reports a deployment, when an agent records one, or when you promote it here.</p>
      <div className="card map scroll-x" style={{ marginBottom: 28 }}>
        <div className="card-head"><h2>Release map</h2>
          <nav className="seg" aria-label="Range"><a href="/delivery/releases" aria-current={searchParams.map !== "all" ? "true" : undefined}>Active</a><a href="/delivery/releases?map=all" aria-current={searchParams.map === "all" ? "true" : undefined}>All</a></nav>
        </div>
        <ReleaseMap releases={releases.filter((r) => r.stages.some((s) => s.status) && (searchParams.map === "all" || !r.stages.some((s) => s.isProd && s.status === "deployed" && s.at && today().getTime() - Date.parse(s.at) > 45 * 86_400_000)))} />
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
                    <td data-label="Release"><a className="rowlink" href={`/delivery/releases/${r.projectKey}/${encodeURIComponent(r.version)}`}><b>{r.version}</b></a></td>
                    <td data-label="Project"><span className="dot" style={{ background: `var(--${r.projectColor})` }} />{r.projectName}</td>
                    <td data-label="Proposals" className="num">{r.proposals}</td>
                    {envs.map((e) => { const s = r.stages.find((x) => x.environment === e); return <td key={e} data-label={e}>{s ? cell(s) : <span className="muted" title="Not an environment of this project">n/a</span>}</td>; })}
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
