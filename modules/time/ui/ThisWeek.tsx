import { PinButton } from "@amax/ui";
import type { TeamRow } from "../server/team";
import { approveAction } from "../actions";
import { COLORS, hrs } from "./parts";

export function ThisWeek({ rows, projects, week }: { rows: TeamRow[]; projects: { name: string; hours: number }[]; week: string }) {
  const total = rows.reduce((n, r) => n + r.total, 0);
  const allocated = rows.length * 40;
  const ready = rows.filter((r) => r.status === "submitted" && r.canApprove);
  const readyHours = ready.reduce((n, r) => n + r.total, 0);
  return (
    <div className="card pinnable">
      <PinButton pin={{ label: `This week, ${week}`, tool: "get_team_week", args: { week } }} />
      <h2>This week</h2>
      <div className="big" style={{ margin: "18px 0 4px" }}>{total.toFixed(1)} h <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>of {allocated} h allocated</span></div>
      <div className="gbar" style={{ margin: "16px 0 22px" }}><i style={{ width: `${allocated ? Math.min(100, (total / allocated) * 100) : 0}%`, background: "linear-gradient(90deg,#C3B5FF,#7B61FF)" }} /></div>
      {projects.map((p, i) => (
        <div className="row line" key={p.name}><span><span className="dot" style={{ background: COLORS[i % COLORS.length] }} />{p.name}</span><b>{p.hours.toFixed(1)} h</b></div>
      ))}
      <form action={approveAction}>
        {ready.map((r) => <input key={r.weekId} type="hidden" name="weekId" value={r.weekId} />)}
        <button className="btn primary" type="submit" disabled={!ready.length} style={{ width: "100%", justifyContent: "center", height: 46, marginTop: 16 }}>
          {ready.length ? `Approve ${ready.length} submitted (${hrs(readyHours)} h)` : "Nothing waiting for you"}
        </button>
      </form>
    </div>
  );
}
