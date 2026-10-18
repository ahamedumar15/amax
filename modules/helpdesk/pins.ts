import type { PinnedRecord } from "@amax/core";
import type { PinRef } from "@amax/ui";

// Pins name a record by its id (059); labels come from the record as it is read now.
type TicketLike = { id: string; number: string; title: string };
export const ticketLabel = (t: TicketLike) => `${t.number}: ${t.title}`;
export const ticketPin = (t: TicketLike): PinRef => ({ label: ticketLabel(t), tool: "get_ticket", args: { ticketId: t.id } });
export const ticketOf = (t: TicketLike | null): PinnedRecord | null => (t ? { id: t.id, label: ticketLabel(t) } : null);
/** A tile, a chart or a queue: resolves to the helpdesk as the viewer reads it, for that queue. */
export const viewPin = (label: string, queue?: string): PinRef => ({ label, tool: "get_helpdesk", args: queue ? { queue } : {} });
