import type { PinnedRecord } from "@amax/core";
import type { PinRef } from "@amax/ui";

// Career pins name a record by its id (059): the person for the career and its figures, the event for a node or row.
type Who = { id: string; name: string };
export const personPin = (p: Who): PinRef => ({ label: p.name, tool: "get_person", args: { personId: p.id } });
export const careerPin = (p: Who, what = "career"): PinRef => ({ label: `${p.name}, ${what}`, tool: "get_career", args: { personId: p.id } });
export const eventPin = (p: Who, e: { id: string; title: string }): PinRef => ({ label: `${e.title}, ${p.name}`, tool: "get_career_event", args: { personId: p.id, eventId: e.id } });

export const careerOf = (r: { person: Who } | null): PinnedRecord | null => (r ? { id: r.person.id, label: careerPin(r.person).label } : null);
export const eventOf = (r: { person: Who; row: { id: string; title: string } } | null): PinnedRecord | null => (r ? { id: r.row.id, label: eventPin(r.person, r.row).label } : null);
