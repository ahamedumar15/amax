import { PinButton } from "@amax/ui";
import type { Calendar as Cal, Mark } from "../server/calendar";
import { isWeekend } from "../server/days";
import { avatar, initials, longDate, monthName, styleOf, TYPE_STYLE } from "./parts";

const LEGEND: [string, string][] = [["annual", "Annual"], ["casual", "Casual"], ["medical", "Medical"], ["lieu", "Lieu"]];

function cell(day: string, mark: Mark, holiday: string | undefined, labels: Record<string, string>) {
  if (holiday) return { cls: "ph", text: holiday };
  if (isWeekend(day)) return { cls: "we", text: "Weekend" };
  if (mark === "pending") return { cls: "pend", text: "Leave requested, waiting for approval" };
  if (mark) return { cls: styleOf(mark).cls, text: `${labels[mark] ?? mark} leave` };
  return { cls: "", text: "" };
}

export function Calendar({ cal, labels }: { cal: Cal; labels: Record<string, string> }) {
  const holidays = new Map(cal.holidays.map((h) => [h.on, h.name]));
  const title = `Team calendar, ${monthName(cal.month)}`;
  const today = cal.days.includes(cal.today) ? cal.today : null;
  return (
    <div className="card pinnable" style={{ marginBottom: 28 }} id="leave-calendar">
      <div className="card-head">
        <h2>{title}</h2><PinButton inline pin={{ label: title, tool: "get_team_calendar", args: { month: cal.month } }} />
        <div className="legend">
          {LEGEND.map(([t, l]) => <span key={t}><i style={{ background: TYPE_STYLE[t].color }} />{l}</span>)}
          <span><i style={{ boxShadow: "inset 0 0 0 1.5px #7B61FF" }} />Pending</span>
          <span><i style={{ background: "#FFF1D6" }} />Holiday</span>
          {today && <span><i style={{ boxShadow: "inset 0 0 0 2px var(--ink)" }} />Today, {longDate(today)}</span>}
        </div>
      </div>
      <div className="scroll-x"><table className="cal">
        <caption className="sr">{title}: leave by person and day</caption>
        <thead><tr><th className="nm" scope="col">Person</th>{cal.days.map((d) => (
          <th key={d} scope="col" className={`d hd${d === today ? " today" : ""}`} aria-label={longDate(d, true)}>{Number(d.slice(8))}</th>))}</tr></thead>
        <tbody>
          {cal.rows.map((r) => (
            <tr key={r.userId} className="pinnable">
              <th className="nm" scope="row"><span className="who"><span className={`av sm ${avatar(r.name)}`} aria-hidden="true">{initials(r.name)}</span>{r.name}
                <PinButton inline pin={{ label: `${r.name}, ${monthName(cal.month)}`, tool: "get_team_calendar", args: { month: cal.month, userId: r.userId } }} /></span></th>
              {cal.days.map((d, i) => {
                const c = cell(d, r.marks[i], holidays.get(d), labels);
                return <td key={d} className={`d ${c.cls}${d === today ? " today" : ""}`} title={`${longDate(d)}${c.text ? `: ${c.text}` : ""}`}>{c.text && <span className="sr">{c.text}</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
