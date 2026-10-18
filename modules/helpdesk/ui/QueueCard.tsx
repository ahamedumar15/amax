import { EmptyState, IntentButton, PinButton } from "@amax/ui";
import { ticketPin, viewPin } from "../pins";
import type { TicketRow } from "../server/rows";
import { SHOWN, type HelpdeskView } from "../server/views";
import { ago, SlaLeft } from "./parts";

const VIA = { chat: "chat", teams: "Teams", email: "email" } as const;
const initials = (name: string) => name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const tint = (s: string) => `a${([...s].reduce((n, c) => n + c.charCodeAt(0), 0) % 4) + 1}`;
const Who = ({ name }: { name: string }) => <div className="who"><span className={`av sm ${tint(name)}`} aria-hidden="true">{initials(name)}</span>{name}</div>;

// 025 and AC-1: a ticket's text from Teams or email is outside data, shown only as text, with a link to the message.
function Row({ t, now }: { t: TicketRow; now: string }) {
  const sub = t.status === "resolved" ? t.resolution : t.note ?? `Opened ${ago(t.openedAt, now)}, via ${VIA[t.channel]}`;
  return (
    <tr className="pinnable" data-ticket={t.number}>
      <td data-label="Ticket"><b>{t.number}</b> {t.title}<small>{t.needsVerification ? <span className="chip warn">{sub}</span> : sub}
        {t.sourceLink && <> <a href={t.sourceLink} target="_blank" rel="noopener noreferrer nofollow">Open the message<span className="sr"> ({t.number}, opens in a new tab)</span></a></>}</small></td>
      <td data-label="Requester">{t.requester ? <Who name={t.requester} /> : <span className="muted">Outside amax</span>}</td>
      <td data-label="Category">{t.category}</td>
      <td data-label="Priority"><span className={`chip${t.priority === "high" || t.priority === "urgent" ? " bad" : ""}`}>{t.priority[0].toUpperCase() + t.priority.slice(1)}</span></td>
      <td data-label="SLA"><SlaLeft sla={t.sla} /></td>
      <td data-label="Handled by">{t.handler?.kind === "agent" ? <span className="chip agent">Support agent</span> : t.handler ? <Who name={t.handler.name} /> : <span className="muted">Unassigned</span>}
        <PinButton pin={ticketPin(t)} /></td>
    </tr>
  );
}

export function QueueCard({ v, all }: { v: HelpdeskView; all: boolean }) {
  const q = v.queue;
  if (!q) return null;
  const rows = all ? v.tickets : v.tickets.slice(0, SHOWN);
  return (
    <div className="card flush pinnable queue">
      <div className="card-head"><h2>{q.name} queue</h2><PinButton pin={viewPin(`${q.name} queue`, q.key)} /></div>
      {v.tickets.length === 0 ? (
        <EmptyState icon="help" title={`No open ${q.name} tickets`} hint="Requests raised in Teams, by email or in chat land here. The support agent picks up access requests first."
          action={<IntentButton intent="helpdesk.new-ticket" label="New ticket" />} />
      ) : (
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">{q.name} queue: open tickets and those closed today</caption>
          <thead><tr><th>Ticket</th><th>Requester</th><th>Category</th><th>Priority</th><th>SLA</th><th>Handled by</th></tr></thead>
          <tbody>{rows.map((t) => <Row key={t.id} t={t} now={v.now} />)}</tbody>
        </table></div>
      )}
      {!all && v.tickets.length > SHOWN && <p className="foot-note"><a href={`/helpdesk?queue=${encodeURIComponent(q.key)}&all=1`}>Show all {v.tickets.length}</a></p>}
    </div>
  );
}
