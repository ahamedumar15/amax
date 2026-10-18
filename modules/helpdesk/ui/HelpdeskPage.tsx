import type { ScreenProps } from "@amax/core";
import { IntentButton } from "@amax/ui";
import type { Category } from "../contracts";
import { helpdeskView, type HelpdeskView } from "../server/views";
import { Charts } from "./Charts";
import { plural, SignInFirst, viewerOrNull } from "./parts";
import { QueueCard } from "./QueueCard";
import { QueueTabs } from "./QueueTabs";
import { Tiles } from "./Tiles";

const WHAT: Partial<Record<Category, string>> = { Access: "access requests", Hardware: "hardware requests", Network: "network problems", "HR letters": "HR letters" };

// Leads with what needs a person: breached and nearly breached SLAs, after what the agent took on.
function lede(v: HelpdeskView) {
  const s = v.stats;
  const most = s.agentMostly;
  const agent = s.agentShare ? `The support agent solved ${s.agentShare}% of tickets on its own this month${most && WHAT[most] ? `, mostly ${WHAT[most]}` : ""}.` : "The support agent hasn't solved a ticket on its own this month.";
  const late = v.breached ? ` ${plural(v.breached, "ticket has", "tickets have")} breached ${v.breached === 1 ? "its" : "their"} SLA.` : "";
  const near = v.nearBreach ? ` ${plural(v.nearBreach, "ticket is", "tickets are")} close to breaching ${v.nearBreach === 1 ? "its" : "their"} SLA.` : " No ticket is close to breaching its SLA.";
  return `${agent}${late}${near}`;
}

export async function HelpdeskPage({ viewer: raw, searchParams }: ScreenProps) {
  const viewer = viewerOrNull(raw);
  if (!viewer) return <div className="helpdesk"><h1>Helpdesk</h1><SignInFirst /></div>;
  const v = await helpdeskView(viewer, searchParams?.queue);
  return (
    <div className="helpdesk">
      <div className="row head">
        <div><h1>Helpdesk</h1><p className="lede">{lede(v)}</p></div>
        <div className="actions"><QueueTabs v={v} /><IntentButton intent="helpdesk.new-ticket" label="New ticket" /></div>
      </div>
      <Tiles v={v} />
      <Charts v={v} />
      <QueueCard v={v} all={searchParams?.all === "1"} />
    </div>
  );
}
