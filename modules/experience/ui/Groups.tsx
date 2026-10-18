import { PinButton } from "@amax/ui";
import { FORMULA, type Dimension } from "../contracts";
import { viewPin } from "../pins";
import type { ExperienceView } from "../server/views";
import { GroupSelect } from "./GroupSelect";
import { plural } from "./parts";

const NAME: Record<Dimension, string> = { department: "Department", site: "Site", model: "Device model" };
type Row = ExperienceView["groups"][number];

function Trend({ t }: { t: Row["trend"] }) {
  if (t.kind === "new") return <span className="chip">New</span>;
  if (t.kind === "steady") return <span className="chip good">Steady</span>;
  return <span className={`chip ${t.kind === "down" ? "warn" : "info"}`}>{t.kind === "down" ? "Down" : "Up"} {Math.abs(t.delta!).toFixed(1)}</span>;
}

const tone = (g: Row) => (g.trend.kind === "down" ? "var(--yellow)" : g.score >= 7.8 ? "var(--mint)" : "var(--violet)");

// AC-3: groups of 5 or more people only; "Other" is shown only when it has 5 too. No row names a person.
export function Groups({ v }: { v: ExperienceView }) {
  const by = v.dimension === "department" ? undefined : v.dimension;
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>By {NAME[v.dimension].toLowerCase()}</h2><GroupSelect value={v.dimension} /></div>
      <div className="scroll-x"><table className="tbl">
        <caption className="sr">Experience score by {NAME[v.dimension].toLowerCase()}, groups of 5 or more people</caption>
        <thead><tr><th>{NAME[v.dimension]}</th><th className="num">People</th><th>Score</th><th>Top issue</th><th>Last 4 weeks</th></tr></thead>
        <tbody>
          {v.groups.map((g) => (
            <tr key={g.key} className="pinnable">
              <td>{g.label}{g.key === "other" && <> <small>{g.members.join(", ")}</small></>}</td>
              <td className="num">{g.people}</td>
              <td><div className="row"><div className="meter" style={{ flex: 1 }} aria-hidden="true"><i style={{ width: `${g.score * 10}%`, background: tone(g) }} /></div>{g.score.toFixed(1)}</div></td>
              <td>{g.top ?? "None"}</td>
              <td><Trend t={g.trend} /><PinButton pin={viewPin(`${g.label}: experience ${g.score.toFixed(1)}`, by)} /></td>
            </tr>
          ))}
          <tr className="total pinnable"><td>All</td><td className="num">{v.all.people}</td><td>{v.all.score.toFixed(1)}</td>
            <td colSpan={2} className="muted">Groups under 5 people are never shown<PinButton pin={viewPin("Experience score, all people", by)} /></td></tr>
        </tbody>
      </table></div>
      <p className="formula">{FORMULA}; without 5 pulse answers, 50% device health and 50% app reliability.{v.hidden ? ` ${plural(v.hidden, "person", "people")} in groups under 5 not shown.` : ""}</p>
    </div>
  );
}
