import type { PinnedRecord } from "@amax/core";
import type { PinRef } from "@amax/ui";

// Presales pins name a record by its id (059). The read tools' `of` give the label from the record as
// it is now, in the words the pages use, so a renamed deal's chip shows its new title.
export const oppPin = (o: { id: string; number: string; title: string }): PinRef => ({ label: `${o.number} ${o.title}`, tool: "get_opportunity", args: { opportunityId: o.id } });
export const itemPin = (number: string, label: string, id: string): PinRef => ({ label: `${number} ${label}`, tool: "get_opportunity_item", args: { number, id } });

export const opportunityOf = (r: { id: string; number: string; title: string } | null): PinnedRecord | null => (r ? { id: r.id, label: oppPin(r).label } : null);
export const itemOf = (r: { id: string; number: string; kind: string; title: string } | null): PinnedRecord | null =>
  (r ? { id: r.id, label: itemPin(r.number, `${r.kind}: ${r.title}`, r.id).label } : null);
