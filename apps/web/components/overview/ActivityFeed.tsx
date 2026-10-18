import type { ActivityItem } from "@amax/core";
import { PinButton } from "@amax/ui";

// How long ago, as the 001 mock writes it: minutes, then hours, then the weekday, then the date.
export function ago(iso: string, now = Date.now()) {
  const at = new Date(iso);
  const min = Math.max(0, Math.round((now - at.getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h`;
  if (min < 7 * 24 * 60) return at.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return at.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const initials = (by: string) => by.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/** The Overview's Agent activity card (008 AC-4): who did what, an agent shown as acting for a person. */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>Agent activity</h2><PinButton inline pin={{ label: "Agent activity", tool: "list_activity", args: {} }} /></div>
      <ul className="feed">
        {items.map((i) => (
          <li key={i.id} className="pinnable">
            <span className={`av${i.agent ? " ai" : ""}`} aria-hidden="true">{i.agent ? "AI" : initials(i.by)}</span>
            <div><p>{i.agent ? <span className="by">{i.by}</span> : <b>{i.by}</b>} {i.text}</p>{i.detail && <small>{i.detail}</small>}</div>
            <span className="when"><time dateTime={i.at}>{ago(i.at)}</time><PinButton pin={i.pin} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
