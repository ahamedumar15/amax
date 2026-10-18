import type { ScreenProps } from "@amax/core";
import { canEver } from "@amax/auth";
import { IntentButton } from "@amax/ui";
import { inboxOverview, type Overview } from "../server/views";
import { FoundList } from "./FoundList";
import { plural, SignInFirst, viewerOrNull } from "./parts";
import { ScansCard } from "./ScansCard";
import { SourcesCard } from "./SourcesCard";
import { Tickets } from "./Tickets";

const TAIL = "Nothing is added until someone accepts it, and changes happen in chat. Pin anything, then ask.";

// Leads with what needs a person: no consent, a failed scan, then the finds waiting.
function lede(o: Overview) {
  if (!o.consent?.granted) return "The inbox agent reads nothing yet: an Entra admin must grant consent for the amax app, then ask amax to record it.";
  const failed = o.lastScan?.status === "failed" ? `The last scan failed: ${o.lastScan.failure}. ` : "";
  const finds = o.finds.length ? `${plural(o.finds.length, "find")} from Teams and email ${o.finds.length === 1 ? "waits" : "wait"} for you.` : "Nothing from Teams and email waits for you.";
  const channels = o.sources.filter((s) => s.kind === "channel").length;
  return `${failed}${finds} The agent reads ${plural(channels, "channel")} and ${plural(o.sources.length - channels, "mailbox", "mailboxes")} every hour. ${TAIL}`;
}

export async function InboxPage({ viewer: raw }: ScreenProps) {
  const viewer = viewerOrNull(raw);
  if (!viewer) return <div className="inbox-agent"><h1>Inbox agent</h1><SignInFirst /></div>;
  const o = await inboxOverview(viewer);
  return (
    <div className="inbox-agent">
      <div className="row head">
        <div><h1>Inbox agent</h1><p className="lede">{lede(o)}</p></div>
        {canEver(viewer, "inbox-agent:manage") && (
          <div className="actions">
            <IntentButton intent="inbox-agent.allow-source" label="Allow a mailbox or channel" primary={false} />
            <IntentButton intent="inbox-agent.consent" label="Record admin consent" primary={false} />
          </div>
        )}
      </div>
      <Tickets o={o} />
      <FoundList finds={o.finds} />
      <SourcesCard sources={o.sources} />
      <ScansCard scans={o.scans} />
    </div>
  );
}
