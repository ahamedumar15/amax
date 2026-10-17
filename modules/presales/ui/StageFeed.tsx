import { PinButton } from "@amax/ui";
import type { StageChangeRow } from "../server/queries";
import { day, first, initials, lowerFirst, StageChip } from "./parts";

function Line({ c }: { c: StageChangeRow }) {
  const what = `${c.client} ${lowerFirst(c.title)}`;
  if (c.to === "lost") return <p><b>{first(c.byName)}</b> marked {what} <StageChip stage="lost" /></p>;
  if (c.to === c.from) return <p><b>{first(c.byName)}</b> updated the win chance on {what}</p>;
  return <p><b>{first(c.byName)}</b> moved {what} to <StageChip stage={c.to} /></p>;
}

const detail = (c: StageChangeRow) =>
  c.to === "lost" ? `Reason: ${(c.reason ?? "").toLowerCase()}.${c.competitor ? ` Competitor: ${c.competitor.toLowerCase()}` : ""}` : `Win chance ${c.fromChance}% → ${c.toChance}%`;

export function StageFeed({ changes }: { changes: StageChangeRow[] }) {
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Recent stage changes</h2><PinButton inline pin={{ label: "Recent stage changes", tool: "list_opportunities", args: {} }} /><span className="chip agent">Tracked automatically</span></div>
      <ul className="feed">
        {changes.map((c) => (
          <li key={`${c.number}-${c.at}`} className="pinnable"><span className="av" aria-hidden="true">{initials(c.byName)}</span><div><Line c={c} /><small>{detail(c)}</small></div><time dateTime={c.at}>{day(c.at)}</time><PinButton pin={{ label: `${c.number} ${c.title}`, tool: "get_opportunity", args: { number: c.number } }} /></li>
        ))}
        {!changes.length && <li><span /><div><p>No stage changes yet.</p></div></li>}
      </ul>
    </div>
  );
}
