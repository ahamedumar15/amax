import type { ScreenProps } from "@amax/core";
import { IntentButton } from "@amax/ui";
import { logAction, submitAction } from "../actions";
import { myWeek } from "../server/my";
import { parseWeekKey } from "../week";
import { notFound } from "next/navigation";
import { DAY_NAMES, Head, hrs, SignInFirst, STATUS, viewerOrNull, weekSpan } from "./parts";

// A malformed or non-existent week in the URL is a 404, never a quiet fallback to another week.
const weekParam = (key: string | undefined) => {
  if (!key) return undefined;
  return parseWeekKey(key) ?? notFound();
};

export async function MyPage({ viewer: raw, params }: ScreenProps) {
  const viewer = viewerOrNull(raw);
  if (!viewer) return <div className="time"><h1>My timesheet</h1><SignInFirst /></div>;
  const m = await myWeek(viewer, weekParam(params.week));
  const open = m.status !== "approved";
  const canSubmit = m.total > 0 && (m.status === "draft" || m.status === "rejected");
  const lede = `${weekSpan(m.week, m.days)}. ${m.total.toFixed(1)} h logged${m.total ? `, ${Math.round((m.agentHours / m.total) * 100)}% by agents` : ""}.${m.status === "approved" ? " Approved and locked." : ""}`;
  return (
    <div className="time">
      <Head title="My timesheet" lede={lede} week={m.week} base="/my" />
      {m.rejectComment && m.status === "rejected" && <p className="chip bad" role="status">Sent back: {m.rejectComment}</p>}
      <div className="card flush">
        <div className="card-head">
          <h2>{m.key}{m.status && <> <span className={`chip ${STATUS[m.status][0]}`}>{STATUS[m.status][1]}</span></>}</h2>
          <div className="actions">
            {open && <IntentButton intent="time.log" label="Log time" primary={false} />}
            {canSubmit && <form action={submitAction}><input type="hidden" name="week" value={m.key} /><button className="btn primary" type="submit">Submit {hrs(m.total)} h</button></form>}
          </div>
        </div>
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">My hours for {m.key}</caption>
          <thead><tr><th>Project</th>{DAY_NAMES.map((d) => <th className="num" key={d}>{d}</th>)}<th className="num">Total</th></tr></thead>
          <tbody>
            {m.rows.map((r) => <tr key={r.projectName}><td data-label="Project">{r.projectName}</td>{r.days.map((h, i) => <td className="num" data-label={DAY_NAMES[i]} key={i}>{hrs(h)}</td>)}<td className="num" data-label="Total"><b>{r.total.toFixed(1)}</b></td></tr>)}
            {m.rows.length === 0 && <tr><td colSpan={7} className="muted">No time logged this week.</td></tr>}
          </tbody>
          <tfoot><tr><th scope="row">Total</th>{m.perDay.map((h, i) => <td className="num" key={i}>{hrs(h)}</td>)}<td className="num"><b>{m.total.toFixed(1)}</b></td></tr></tfoot>
        </table></div>
      </div>
      {open && (
        <form action={logAction} className="card logform" style={{ marginTop: 28 }} aria-label="Log time">
          <label>Project<select name="projectKey" required>{m.projects.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select></label>
          <label>Day<select name="day">{m.days.map((d, i) => <option key={d} value={d}>{DAY_NAMES[i]} {d.slice(5)}</option>)}</select></label>
          <label>Hours<input name="hours" type="number" min="0.25" max="24" step="0.25" required /></label>
          <label><span>Billable</span><input name="billable" type="checkbox" defaultChecked /></label>
          <button className="btn" type="submit">Log</button>
        </form>
      )}
    </div>
  );
}
