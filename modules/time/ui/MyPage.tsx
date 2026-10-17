import type { ScreenProps } from "@amax/core";
import { PinButton } from "@amax/ui";
import { AskButton } from "./AskButton";
import { myWeek } from "../server/my";
import { DAY_NAMES, Head, hrs, SignInFirst, weekParam, STATUS, viewerOrNull, weekSpan } from "./parts";

export async function MyPage({ viewer: raw, params }: ScreenProps) {
  const viewer = viewerOrNull(raw);
  if (!viewer) return <div className="time"><h1>My timesheet</h1><SignInFirst /></div>;
  const m = await myWeek(viewer, weekParam(params.week));
  const open = m.status !== "approved";
  const canSubmit = m.total > 0 && (m.status === "draft" || m.status === "rejected");
  const weekPin = { label: `My timesheet ${m.key}`, tool: "get_my_week", args: { week: m.key } };
  const pin = (project: string) => <PinButton pin={{ label: `${project}, ${m.key}`, tool: "get_timesheet", args: { week: m.key, project } }} />;
  const lede = `${weekSpan(m.week, m.days)}. ${m.total.toFixed(1)} h logged${m.total ? `, ${Math.round((m.agentHours / m.total) * 100)}% by agents` : ""}.${m.status === "approved" ? " Approved and locked." : ""}`;
  return (
    <div className="time">
      <Head title="My timesheet" lede={lede} week={m.week} base="/my" />
      {m.rejectComment && m.status === "rejected" && <p className="chip bad" role="status">Sent back: {m.rejectComment}</p>}
      <div className="card flush pinnable">
        <div className="card-head">
          <h2>{m.key}{m.status && <> <span className={`chip ${STATUS[m.status][0]}`}>{STATUS[m.status][1]}</span></>}</h2>
          <PinButton inline pin={weekPin} />
          <div className="actions">
            {open && <AskButton className="btn" label="Ask amax to log time" prompt={`Log time on ${m.key}: `} pin={weekPin} />}
            {canSubmit && <AskButton className="btn primary" label={`Ask amax to submit week ${m.week.week}`} prompt={`Submit my timesheet for ${m.key}`} pin={weekPin} />}
          </div>
        </div>
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">My hours for {m.key}</caption>
          <thead><tr><th>Project</th>{DAY_NAMES.map((d) => <th className="num" key={d}>{d}</th>)}<th className="num">Total</th></tr></thead>
          <tbody>
            {m.rows.map((r) => <tr key={r.projectName} className="pinnable"><td data-label="Project">{r.projectName}</td>{r.days.map((h, i) => <td className="num" data-label={DAY_NAMES[i]} key={i}>{hrs(h)}</td>)}<td className="num" data-label="Total"><b>{r.total.toFixed(1)}</b>{pin(r.projectName)}</td></tr>)}
            {m.rows.length === 0 && <tr><td colSpan={7} className="muted">No time logged this week.</td></tr>}
          </tbody>
          <tfoot><tr><th scope="row">Total</th>{m.perDay.map((h, i) => <td className="num" key={i}>{hrs(h)}</td>)}<td className="num"><b>{m.total.toFixed(1)}</b></td></tr></tfoot>
        </table></div>
      </div>
    </div>
  );
}
