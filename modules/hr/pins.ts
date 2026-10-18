import type { PinnedRecord } from "@amax/core";
import type { PinRef } from "@amax/ui";

// A person's pin names them by their id (059); get_person's `of` gives the label from the record as it
// is now, in the words the pages use, so a chip still reads right after a name change.
export const personPin = (p: { id: string; name: string }): PinRef => ({ label: p.name, tool: "get_person", args: { personId: p.id } });

export const personOf = (r: { person: { id: string; name: string } } | null): PinnedRecord | null =>
  r ? { id: r.person.id, label: personPin(r.person).label } : null;
