import type { ApiStats, WebhookView } from "@amax/api";
import { PinButton } from "@amax/ui";
import { AskButton } from "../../../../components/settings/AskButton";
import { lastUsed, PROVIDER_NAMES } from "./format";

function status(w: WebhookView) {
  if (w.status === "off") return <span className="chip bad">Switched off</span>;
  return w.failures ? <span className="chip warn">{w.failures} failing</span> : <span className="chip good">Active</span>;
}

function Ask({ w }: { w: WebhookView }) {
  const pin = { label: w.name, tool: "get_webhook", args: { id: w.id } };
  if (w.status === "off") return <AskButton label="Ask to resume" prompt={`Resume the ${w.name} webhook`} pin={pin} tool="resume_webhook" name={`Ask to resume ${w.name}`} />;
  return <AskButton label="Ask amax" prompt={`Unsubscribe the ${w.name} webhook`} pin={pin} tool="unsubscribe_webhook" name={`Ask amax about ${w.name}`} />;
}

export function OutgoingTable({ hooks, now }: { hooks: WebhookView[]; now: Date }) {
  return (
    <div className="scroll-x"><table className="tbl">
      <caption className="sr">Outgoing webhooks</caption>
      <thead><tr><th>Name</th><th>Sends to</th><th>Events</th><th>Status</th><th>Delivered this week</th><th>Last delivery</th><th className="num"><span className="sr">Ask</span></th></tr></thead>
      <tbody>
        {hooks.length === 0 && <tr><td colSpan={7} className="muted">No outgoing webhooks. Ask amax to send events to a URL.</td></tr>}
        {hooks.map((w) => (
          <tr key={w.id} className="pinnable">
            <td data-label="Name"><b>{w.name}</b></td>
            <td data-label="Sends to">{new URL(w.url).host}</td>
            <td data-label="Events">{w.events.length === 1 ? w.events[0] : `${w.events.length} events`}</td>
            <td data-label="Status">{status(w)}</td>
            <td data-label="Delivered this week">{w.total ? `${w.delivered} of ${w.total}` : "None"}</td>
            <td data-label="Last delivery">{lastUsed(w.lastDeliveryAt, now)}</td>
            <td className="num"><Ask w={w} /><PinButton pin={{ label: w.name, tool: "get_webhook", args: { id: w.id } }} /></td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

export function IncomingTable({ inbound, now }: { inbound: ApiStats["inbound"]; now: Date }) {
  return (
    <div className="scroll-x"><table className="tbl">
      <caption className="sr">Incoming webhooks</caption>
      <thead><tr><th>From</th><th>Verified with</th><th>Verified this week</th><th>Rejected this week</th><th>Last verified</th><th className="num"><span className="sr">Pin</span></th></tr></thead>
      <tbody>
        {inbound.map((i) => (
          <tr key={i.provider} className="pinnable">
            <td data-label="From"><b>{PROVIDER_NAMES[i.provider]}</b></td>
            <td data-label="Verified with">{i.provider === "msgraph" ? "clientState" : i.provider === "azure-devops" ? "Basic auth secret" : "HMAC-SHA256 signature"}</td>
            <td data-label="Verified this week">{i.verified}</td>
            <td data-label="Rejected this week">{i.rejected ? <span className="chip bad">{i.rejected}</span> : "0"}</td>
            <td data-label="Last verified">{lastUsed(i.lastVerifiedAt, now)}</td>
            <td className="num"><PinButton pin={{ label: `Incoming ${PROVIDER_NAMES[i.provider]} webhooks`, tool: "get_api_overview", args: { provider: i.provider } }} /></td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}
