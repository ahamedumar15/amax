import type { PinnedRecord } from "@amax/core";
import type { PinRef } from "@amax/ui";

// Inbox agent pins name a record by its id (059); labels come from the record as it is read now.
type FindLike = { id: string; sourceLabel: string; route: { label: string } | null };
type SourceLike = { id: string; label: string; kind: string };
type ScanLike = { id: string; startedAt: string };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
export const findLabel = (f: FindLike) => `Inbox find: ${f.route?.label ?? "message"} from ${f.sourceLabel}`;
export const sourceLabel = (s: SourceLike) => `Inbox ${s.kind}: ${s.label}`;
export const scanLabel = (s: ScanLike) => `Teams and email scan, ${when(s.startedAt)}`;

export const findPin = (f: FindLike): PinRef => ({ label: findLabel(f), tool: "get_inbox_find", args: { findId: f.id } });
export const sourcePin = (s: SourceLike): PinRef => ({ label: sourceLabel(s), tool: "get_inbox_source", args: { sourceId: s.id } });
export const scanPin = (s: ScanLike): PinRef => ({ label: scanLabel(s), tool: "get_inbox_scan", args: { scanId: s.id } });
/** A tile, the list of finds or the allow-list: resolves to the agent's overview. */
export const viewPin = (label: string): PinRef => ({ label, tool: "get_inbox_agent", args: {} });

export const findOf = (f: FindLike | null): PinnedRecord | null => (f ? { id: f.id, label: findLabel(f) } : null);
export const sourceOf = (s: SourceLike | null): PinnedRecord | null => (s ? { id: s.id, label: sourceLabel(s) } : null);
export const scanOf = (s: ScanLike | null): PinnedRecord | null => (s ? { id: s.id, label: scanLabel(s) } : null);
