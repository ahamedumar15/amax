import Link from "next/link";
import { PinButton } from "@amax/ui";
import type { InboxGroup } from "../contracts";

const ago = (iso: string, now: number) => {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return m < 2880 ? "Yesterday" : `${Math.round(m / 1440)} days ago`;
};

/** The bell's list, also on the Notifications page: grouped by module, unread first, each item linking to its record. */
export function NotificationList({ groups, now, headingLevel = 3 }: { groups: InboxGroup[]; now: number; headingLevel?: 3 | 4 }) {
  const H = `h${headingLevel}` as "h3" | "h4";
  return groups.map((g) => (
    <div key={g.module}>
      <H className="n-group">{g.title}</H>
      <ul className="n-list">
        {g.items.map((n) => (
          <li key={n.id} className={n.read ? "pinnable" : "pinnable unread"}>
            <span>
              {n.href ? <Link href={n.href}><b>{n.title}</b></Link> : <b>{n.title}</b>}
              <small>{n.urgent && <><span className="chip bad">Urgent</span> </>}{n.body ? `${n.body} · ` : ""}{ago(n.createdAt, now)}{n.read ? "" : " · Unread"}</small>
            </span>
            <PinButton inline pin={n.pin} />
          </li>
        ))}
      </ul>
    </div>
  ));
}
