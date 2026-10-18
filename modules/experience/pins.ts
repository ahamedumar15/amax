import type { PinnedRecord } from "@amax/core";
import type { PinRef } from "@amax/ui";

// Pins name a record by its id (059); labels come from the record as it is read now.
type FixLike = { id: string; fixTitle: string };
export const fixPin = (f: FixLike): PinRef => ({ label: f.fixTitle, tool: "get_experience_fix", args: { issueId: f.id } });
export const fixOf = (f: FixLike | null): PinnedRecord | null => (f ? { id: f.id, label: f.fixTitle } : null);
/** A tile, a group row or a card: resolves to the screen as the viewer reads it, for that grouping. */
export const viewPin = (label: string, by?: string): PinRef => ({ label, tool: "get_experience", args: by ? { by } : {} });
export const suggestionPin = (label: string, id: string): PinRef => ({ label, tool: "get_agent_suggestion", args: { id } });
