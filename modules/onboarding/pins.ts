import type { PinnedRecord } from "@amax/core";
import type { PinRef } from "@amax/ui";

// Onboarding pins name a record by its id (059); the label comes from the record as it is now.
const kindLabel = (kind: string) => (kind === "joiner" ? "joining" : "leaving");
export const checklistPin = (c: { id: string; personName: string; kind: string }): PinRef => ({ label: `${c.personName}, ${kindLabel(c.kind)}`, tool: "get_checklist", args: { checklistId: c.id } });
export const taskPin = (t: { id: string; title: string; personName: string }): PinRef => ({ label: `${t.title}, ${t.personName}`, tool: "get_checklist_task", args: { taskId: t.id } });
export const viewPin = (label: string, tool = "onboarding_summary"): PinRef => ({ label, tool, args: {} });

export const checklistOf = (r: { id: string; personName: string; kind: string } | null): PinnedRecord | null => (r ? { id: r.id, label: checklistPin(r).label } : null);
export const taskOf = (r: { id: string; title: string; personName: string } | null): PinnedRecord | null => (r ? { id: r.id, label: taskPin(r).label } : null);
