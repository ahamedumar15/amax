import type { OverviewPanel, OverviewQuery, OverviewTicket, OverviewWaiting } from "@amax/core";
import { can, type Viewer } from "@amax/auth";
import { logError } from "@amax/core/server";
import { installed } from "./registry";

export type OverviewData = { tickets: OverviewTicket[]; waiting: OverviewWaiting[]; panels: OverviewPanel[]; ledes: string[]; failed: string[] };

// 068 AC-8: every installed module the viewer may read adds its parts. A module whose hook fails is
// logged and named in `failed`, so its blocks show "Couldn't load" instead of zeros.
export async function gatherOverview(viewer: Viewer, query: OverviewQuery): Promise<OverviewData> {
  const mods = installed.filter((m) => m.overview && can(viewer, `${m.id}:read`));
  const parts = await Promise.all(mods.map((m) => m.overview!(viewer as never, query).then((p) => ({ m, p }), (e: unknown) => (logError(`overview ${m.id}`, e), { m, p: null }))));
  const ok = parts.flatMap(({ p }) => (p ? [p] : []));
  return {
    tickets: ok.flatMap((p) => p.tickets ?? []).sort((a, b) => a.order - b.order),
    waiting: ok.flatMap((p) => p.waiting ?? []).sort((a, b) => a.since.localeCompare(b.since)),
    panels: ok.flatMap((p) => p.panels ?? []).sort((a, b) => a.order - b.order),
    ledes: ok.flatMap((p) => (p.lede ? [p.lede] : [])),
    failed: parts.filter(({ p }) => !p).map(({ m }) => m.title),
  };
}
