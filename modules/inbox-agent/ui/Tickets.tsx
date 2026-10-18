import { PinButton, Ticket } from "@amax/ui";
import { viewPin } from "../pins";
import type { Overview } from "../server/views";
import { ago, plural } from "./parts";

const pin = (label: string) => <PinButton pin={viewPin(label)} />;

function kinds(o: Overview) {
  const by = new Map<string, number>();
  for (const f of o.finds) if (f.route) by.set(f.route.label, (by.get(f.route.label) ?? 0) + 1);
  return [...by].map(([label, n]) => `${n} ${label.toLowerCase()}${n === 1 ? "" : "s"}`).join(", ");
}

export function Tickets({ o }: { o: Overview }) {
  const channels = o.sources.filter((s) => s.kind === "channel").length;
  const failed = o.lastScan?.status === "failed";
  const next = o.nextScanAt ? `${o.every}, next ${ago(o.nextScanAt)}` : "Starts once consent is recorded";
  const consent = !o.consent?.granted ? ["Not granted", "Ask amax to record it once an Entra admin grants it"] : ["Granted", o.consent.sandbox ? "Sandbox Microsoft 365 (fictional)" : `Entra directory ${o.consent.entraTenantId?.slice(0, 8)}…`];
  return (
    <div className="tickets four">
      <Ticket tone={o.finds.length ? "attention" : "good"} label="Open finds" value={String(o.finds.length)} note={kinds(o) || "Nothing waiting"} art={pin("Open finds from Teams and email")} />
      <Ticket tone="info" label="Allowed sources" value={String(o.sources.length)} note={`${plural(channels, "channel")}, ${plural(o.sources.length - channels, "mailbox", "mailboxes")}`} art={pin("Inbox agent allow-list")} />
      <Ticket tone={failed ? "problem" : "good"} label="Last scan" value={o.lastScan ? ago(o.lastScan.finishedAt) : "Not yet"} note={next} art={pin("Last Teams and email scan")} />
      <Ticket tone={o.consent?.granted ? "good" : "problem"} label="Admin consent" value={consent[0]} note={consent[1]} art={pin("Entra admin consent")} />
    </div>
  );
}
