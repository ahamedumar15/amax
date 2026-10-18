import type { Viewer } from "@amax/auth";
import type { ScreenProps } from "@amax/core";
import { Card, EmptyState, PinButton } from "@amax/ui";
import { DIGEST_HOUR, type Preferences } from "../contracts";
import { inbox, preferences } from "../server/read";
import { AskButton } from "./AskButton";
import { NotificationList } from "./List";
import "./notifications.css";

const on = (b: boolean) => (b ? "On" : "Off");
const prefsPin = { label: "My notification settings", tool: "get_notification_preferences", args: {} };

function Channels({ p }: { p: Preferences }) {
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Channels per category</h2></div>
      <div className="scroll-x"><table className="tbl">
        <caption className="sr">Where each category of notification reaches you</caption>
        <thead><tr><th>Category</th><th>In app</th><th>Email</th><th>Teams</th><th>Digest</th><th><span className="sr">Pin</span></th></tr></thead>
        <tbody>
          {p.categories.map((c) => (
            <tr key={c.category} className="pinnable">
              <td data-label="Category">{c.title}</td><td data-label="In app">On</td><td data-label="Email">{on(c.email)}</td><td data-label="Teams">{on(c.teams)}</td>
              <td data-label="Digest">{c.digest ? `Daily at ${DIGEST_HOUR}` : "Off"}</td>
              <td><PinButton inline pin={{ label: `${c.title} notifications`, tool: "get_notification_preferences", args: { category: c.category } }} /></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}

function Quiet({ p }: { p: Preferences }) {
  const where = `${p.zone}${p.entity ? ` (${p.entity})` : ""}`;
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>Quiet hours</h2><PinButton inline pin={{ ...prefsPin, label: "My quiet hours" }} /></div>
      <p>{p.quietHours ? `${p.quietHours.starts} to ${p.quietHours.ends}, ${where}` : `Off. Times are read in ${where}.`}</p>
      <p className="muted" style={{ fontSize: 13 }}>Email and Teams wait until quiet hours end. The bell always shows new items.</p>
      <AskButton label="Ask amax to change quiet hours" prompt="Set my quiet hours to " pin={{ ...prefsPin, label: "My quiet hours" }} />
    </div>
  );
}

export async function NotificationsPage({ viewer: raw }: ScreenProps) {
  const viewer = (raw as Viewer | null) ?? null;
  if (!viewer) return <div className="notif"><h1>Notifications</h1><Card><EmptyState icon="bell" title="Sign in to see your notifications" hint="Your notifications and how they reach you come from the database once you're signed in." /></Card></div>;
  const [p, box] = await Promise.all([preferences(viewer), inbox(viewer)]);
  return (
    <div className="notif">
      <div className="row head">
        <div><h1>Notifications</h1><p className="lede">How amax reaches you. Urgent items skip the digest but wait for your quiet hours. Change anything in chat.</p></div>
        <div className="actions"><AskButton label="Ask amax to change my notifications" prompt="Change my notifications: " pin={prefsPin} /></div>
      </div>
      <div className="cols">
        <div className="stack"><Channels p={p} /><Quiet p={p} /></div>
        <div className="card pinnable">
          <div className="card-head">
            <h2>The bell{box.unread > 0 && <> <span className="chip">{box.unread} unread</span></>}</h2>
            <PinButton inline pin={{ label: "My notifications", tool: "get_notifications", args: {} }} />
            {box.unread > 0 && <AskButton label="Mark all read" prompt="Mark all my notifications read" pin={{ label: "My notifications", tool: "get_notifications", args: {} }} />}
          </div>
          {box.groups.length ? <NotificationList groups={box.groups} now={Date.now()} /> : <p className="muted">Nothing yet. Approvals, releases and reminders show up here.</p>}
        </div>
      </div>
    </div>
  );
}
