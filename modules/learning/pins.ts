import type { PinnedRecord } from "@amax/core";
import type { PinRef } from "@amax/ui";

// Learning pins name a record by its id (059); the label comes from the record as it is now.
export const programmePin = (p: { id: string; title: string }): PinRef => ({ label: p.title, tool: "get_programme", args: { programmeId: p.id } });
export const certificationPin = (c: { id: string; name: string; personName: string }): PinRef => ({ label: `${c.name}, ${c.personName}`, tool: "get_certification", args: { certificationId: c.id } });
export const viewPin = (label: string, tool = "learning_summary"): PinRef => ({ label, tool, args: {} });

export const programmeOf = (r: { id: string; title: string } | null): PinnedRecord | null => (r ? { id: r.id, label: programmePin(r).label } : null);
export const certificationOf = (r: { id: string; name: string; personName: string } | null): PinnedRecord | null => (r ? { id: r.id, label: certificationPin(r).label } : null);
