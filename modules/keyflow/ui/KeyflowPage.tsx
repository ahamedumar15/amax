import type { ScreenProps } from "@amax/core";
import { canEver } from "@amax/auth";
import { IntentButton } from "@amax/ui";
import { syncOverview, type Overview } from "../server/overview";
import { ErrorsCard } from "./ErrorsCard";
import { ago, plural, SignInFirst, viewerOrNull } from "./parts";
import { subjectOf } from "./prompts";
import { RunsCard } from "./RunsCard";
import { SisterCard, SyncTickets } from "./SyncCards";

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const what = (e: Overview["errors"][number]) => (e.kind === "refused" ? `Keyflow refused ${subjectOf(e)}` : lower(e.message));
const TAIL = "The sync runs every 15 minutes as a job. Changes happen in chat. Pin anything, then ask.";

function lede(o: Overview) {
  if (!o.connection) return "Keyflow isn't connected yet. Ask amax to connect it, then add the Keyflow key under Connections and keys. Changes happen in chat.";
  const failed = o.lastRun?.status === "failed" ? `The last sync failed: ${o.lastRun.failure}. ` : "";
  const shown = o.errors.slice(0, 2).map(what);
  const errors = o.errors.length ? `${plural(o.errors.length, "sync error")} ${o.errors.length === 1 ? "needs" : "need"} you: ${shown.join(", and ")}${o.errors.length > 2 ? ", and more" : ""}.`
    : failed ? "" : `Nothing needs you: the last sync went through ${o.lastRun ? ago(o.lastRun.finishedAt) : "not yet"}.`;
  return `${failed}${errors} ${TAIL}`.trim();
}

export async function KeyflowPage({ viewer: raw }: ScreenProps) {
  const viewer = viewerOrNull(raw);
  if (!viewer) return <div className="keyflow"><h1>Keyflow</h1><SignInFirst what="the Keyflow sync" /></div>;
  const o = await syncOverview(viewer);
  return (
    <div className="keyflow">
      <nav className="crumb" aria-label="Breadcrumb"><a href="/settings">Settings</a><span aria-hidden="true">/</span><a href="/settings/integrations">Integrations</a><span aria-hidden="true">/</span>Keyflow</nav>
      <div className="row head">
        <div><h1>Keyflow</h1><p className="lede">{lede(o)}</p></div>
        {canEver(viewer, "keyflow:manage") && <div className="actions"><IntentButton intent="keyflow.connect" label="Ask amax to connect Keyflow" primary={false} /></div>}
      </div>
      <SisterCard o={o} />
      <SyncTickets o={o} />
      <ErrorsCard errors={o.errors} manage={canEver(viewer, "keyflow:manage")} />
      <RunsCard runs={o.runs} />
    </div>
  );
}
