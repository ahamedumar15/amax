import type { StageChangeRow } from "../server/queries";
import { daysBetween, day, first, STAGE_UI, Stk } from "./parts";

const what = (h: StageChangeRow) => (h.from === h.to ? `${STAGE_UI[h.to].label}, win chance updated` : STAGE_UI[h.to].label);
const chance = (h: StageChangeRow) => (h.fromChance === null ? `Win chance ${h.toChance}%` : `Win chance ${h.fromChance}% → ${h.toChance}%`);

// Every change is logged with who and when; each row shows how long it held until the next one.
export function HistoryCard({ history, today }: { history: StageChangeRow[]; today: string }) {
  return (
    <div className="card">
      <div className="card-head"><h2>Stage history</h2><span className="muted">Every change is logged</span></div>
      <ol className="timeline">
        {history.map((h, i) => {
          const ui = STAGE_UI[h.to];
          const note = [h.note, h.to === "lost" && h.reason ? `Reason: ${h.reason.toLowerCase()}` : null].filter(Boolean).join(". ");
          return (
            <li key={`${h.at}-${i}`} className={i === 0 ? "cur" : undefined}>
              <Stk icon={h.from === h.to ? "spark" : ui.icon} color={ui.color} />
              <div><b>{what(h)}</b><small>{first(h.byName)}, {day(h.at)}.{note ? ` ${note}.` : ""} {chance(h)}</small></div>
              <span className="dur">{daysBetween(h.at, i === 0 ? today : history[i - 1].at)} d</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
