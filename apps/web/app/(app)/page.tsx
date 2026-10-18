import type { ActivityItem } from "@amax/core";
import { can, type Viewer } from "@amax/auth";
import { logError } from "@amax/core/server";
import { Card, EmptyState } from "@amax/ui";
import { ActivityFeed } from "../../components/overview/ActivityFeed";
import { installed } from "../../lib/registry";
import { getViewer } from "../../lib/viewer";

export const metadata = { title: "Overview" };

// 008 AC-4: every installed module's newest activity the viewer may read, merged newest first. A
// module whose feed fails is left out and logged, never shown as "nothing happened".
async function activity(viewer: Viewer): Promise<ActivityItem[]> {
  const feeds = installed.filter((m) => m.activity && can(viewer, `${m.id}:read`));
  const lines = await Promise.all(feeds.map((m) => m.activity!(viewer as never, 8).catch((e: unknown) => (logError(`overview.activity ${m.id}`, e), []))));
  return lines.flat().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
}

export default async function OverviewPage() {
  const viewer = await getViewer();
  const items = viewer ? await activity(viewer) : [];
  return (
    <>
      <h1>Delivery overview</h1>
      <p className="lede">{items.length ? `Agents keep the records: the latest is ${items[0].by} ${items[0].text}.` : "Stat cards, the hours chart and Waiting on you arrive with the delivery module."}</p>
      {items.length ? <ActivityFeed items={items} /> : (
        <Card>
          <EmptyState icon="home" title="Nothing to show yet" hint="Activity shows here once agents, pipelines or people record work. Until then, open any installed module from the rail." />
        </Card>
      )}
    </>
  );
}
