import type { ApiStats } from "@amax/api";
import type { CredentialView } from "@amax/auth/credentials-read";
import { PinnedTicket as Ticket } from "../../../../components/settings/PinnedTicket";
import { Art } from "./Art";
import { deliveryRate, limitedNote, live } from "./format";

const OVERVIEW = (label: string) => ({ label, tool: "get_api_overview", args: {} });

export function ApiTickets({ rows, stats }: { rows: CredentialView[]; stats: ApiStats }) {
  const active = live(rows);
  const rejected = stats.inbound.reduce((n, i) => n + i.rejected, 0);
  const rate = deliveryRate(stats.deliveries);
  return (
    <div className="tickets four">
      <Ticket pin={{ label: "Service credentials", tool: "list_api_credentials", args: {} }} tone="info" label="Service credentials" value={String(active.length)}
        note={active.length ? "All with an owner and expiry" : "None yet"} art={<Art name="key" />} />
      <Ticket pin={OVERVIEW("Rejected webhook calls")} tone="problem" label="Rejected webhook calls" value={String(rejected)}
        note={rejected ? "Bad or missing signature" : "None this week"} art={<Art name="shield" />} />
      <Ticket pin={OVERVIEW("Outgoing deliveries")} tone="good" label="Outgoing deliveries" value={rate.value}
        progress={stats.deliveries.total ? { percent: rate.pct, label: rate.label } : undefined} note="Nothing sent this week" art={<Art name="rocket" />} />
      <Ticket pin={OVERVIEW("Requests rate-limited")} tone="attention" label="Requests rate-limited" value={String(stats.limited.total)}
        note={limitedNote(stats.limited)} art={<Art name="clock" />} />
    </div>
  );
}
