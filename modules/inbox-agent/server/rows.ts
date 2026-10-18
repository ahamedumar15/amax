import type { RecordType, ScanStatus, SourceKind } from "../contracts";
import { ROUTES, type Route } from "../routes";

type Row = Record<string, unknown>;
/** The person a find belongs to: the user the agent acts for ("user:<id>"). */
export const ownerOf = (actsFor: unknown) => String(actsFor).replace(/^user:/, "");
export const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string).toISOString());

export type SourceRow = { id: string; kind: SourceKind; address: string; label: string; actsFor: string; actsForName: string | null; allowedBy: string; allowedAt: string; readUntil: string | null; finds: number };
export type ScanRow = { id: string; startedAt: string; finishedAt: string; status: ScanStatus; messages: number; suggested: number; failure: string | null; startedBy: string };
export type FindRow = {
  id: string; sourceId: string; sourceKind: SourceKind; sourceLabel: string; receivedAt: string; excerpt: string; link: string | null;
  actsFor: string; status: string; recordType: RecordType | null; fields: Record<string, unknown>; suggestionId: string | null; expiresAt: string; route: Route | null;
};

export const toSource = (r: Row): SourceRow => ({
  id: r.id as string, kind: r.kind as SourceKind, address: r.address as string, label: r.label as string, actsFor: r.acts_for as string, actsForName: (r.acts_for_name as string | null) ?? null,
  allowedBy: r.allowed_by as string, allowedAt: iso(r.allowed_at)!, readUntil: iso(r.read_until), finds: Number(r.finds ?? 0),
});

export const toScan = (r: Row): ScanRow => ({
  id: r.id as string, startedAt: iso(r.started_at)!, finishedAt: iso(r.finished_at)!, status: r.status as ScanStatus, messages: Number(r.messages),
  suggested: Number(r.suggested), failure: (r.failure as string | null) ?? null, startedBy: r.started_by as string,
});

export const toFind = (r: Row): FindRow => {
  const type = (r.record_type as RecordType | null) ?? null;
  return {
    id: r.id as string, sourceId: r.source_id as string, sourceKind: r.kind as SourceKind, sourceLabel: r.label as string, receivedAt: iso(r.received_at)!,
    excerpt: r.excerpt as string, link: (r.link as string | null) ?? null, actsFor: r.acts_for as string, status: r.status as string, recordType: type, fields: (r.fields as Record<string, unknown> | null) ?? {},
    suggestionId: (r.suggestion_id as string | null) ?? null, expiresAt: iso(r.expires_at)!, route: type ? ROUTES[type] : null,
  };
};
