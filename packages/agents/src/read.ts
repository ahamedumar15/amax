import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { getRuntime } from "@amax/core/server";
import { can, mask, type Viewer } from "@amax/auth";
import { findKind, type SuggestionScope } from "./kinds";
import { CHANNELS, type Channel, type Status } from "./store";

export type Person = { id: string; name: string } | null;
export type SuggestionView = {
  id: string; kind: string; kindTitle: string; title: string; detail: string | null;
  target: { type: string; id: string; label: string }; proposed: Record<string, unknown>;
  evidence: { type: string; label: string; ref: string }[]; confidence: number;
  agent: { id: string; name: string }; actsFor: Person; source: { channel: Channel; label: string | null; ref: string | null; external: boolean };
  status: Status | "expired"; sensitive: boolean; irreversible: boolean;
  firstApprovedBy: Person; decidedBy: Person; decidedAt: string | null; queryNote: string | null;
  undoUntil: string | null; canUndo: boolean; runId: string | null; expiresAt: string; createdAt: string;
};

/** "open": waiting for a decision; "undoable": accepted and still inside its undo window; "closed": the rest. */
export type Bucket = "open" | "undoable" | "closed";
export type ListFilter = { bucket?: Bucket; kind?: string; targetId?: string; id?: string; limit?: number };

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const person = (id: unknown, name: unknown): Person => (id ? { id: String(id), name: (name as string | null) ?? String(id) } : null);

function bucketSql(b: Bucket | undefined) {
  if (b === "open") return sql`s.status in ('open', 'queried', 'approved') and s.expires_at >= now()`;
  if (b === "undoable") return sql`s.status = 'accepted' and s.undo_until >= now()`;
  if (b === "closed") return sql`not (s.status in ('open', 'queried', 'approved') and s.expires_at >= now()) and not (s.status = 'accepted' and coalesce(s.undo_until >= now(), false))`;
  return sql`true`;
}

const named = (col: string) => sql.raw(`(select u.name from auth.user u where 'user:' || u.id::text = s.${col})`);

// 006 AC-5: a suggestion outside the viewer's scope for its kind's permission is never returned, so it
// can't be listed, pinned or counted. Classified fields of the proposed change are masked by class.
export async function listSuggestions(v: Viewer, f: ListFilter = {}): Promise<SuggestionView[]> {
  const rows = await withTenant(getRuntime().db, v.tenantId, (tx) => tx.execute(sql`select s.*, s.expires_at < now() as expired, coalesce(s.undo_until >= now(), false) as undo_open,
      ${named("acts_for")} as acts_for_name, ${named("first_approved_by")} as first_name, ${named("decided_by")} as decided_name
    from agents.suggestion s where ${bucketSql(f.bucket)} and ${f.kind ? sql`s.kind = ${f.kind}` : sql`true`} and ${f.targetId ? sql`s.target_id = ${f.targetId}` : sql`true`}
      and ${f.id ? sql`s.id = ${f.id}` : sql`true`} order by s.expires_at asc, s.created_at desc limit 500`));
  return rows.flatMap((r) => {
    const kind = findKind(r.kind as string);
    const scope = r.scope as SuggestionScope;
    if (!kind || !can(v, kind.permission, scope)) return [];
    const status = (r.status as Status);
    const open = ["open", "queried", "approved"].includes(status);
    const channel = (CHANNELS as readonly string[]).includes(r.source_channel as string) ? (r.source_channel as Channel) : "internal";
    return [{
      id: r.id as string, kind: kind.kind, kindTitle: kind.title, title: r.title as string, detail: (r.detail as string | null) ?? null,
      target: { type: r.target_type as string, id: r.target_id as string, label: r.target_label as string },
      proposed: mask(v, (r.proposed ?? {}) as Record<string, unknown>, kind.fields ?? {}, { ownerUserId: scope.ownerUserId, legalEntityId: scope.legalEntityId }),
      evidence: r.evidence as SuggestionView["evidence"], confidence: Number(r.confidence),
      agent: { id: r.agent as string, name: r.agent_name as string }, actsFor: person(r.acts_for, r.acts_for_name),
      source: { channel, label: (r.source_label as string | null) ?? null, ref: (r.source_ref as string | null) ?? null, external: channel !== "internal" },
      status: (open && r.expired ? "expired" : status) as SuggestionView["status"], sensitive: Boolean(kind.sensitive), irreversible: Boolean(kind.irreversible),
      firstApprovedBy: person(r.first_approved_by, r.first_name), decidedBy: person(r.decided_by, r.decided_name), decidedAt: iso(r.decided_at), queryNote: (r.query_note as string | null) ?? null,
      undoUntil: iso(r.undo_until), canUndo: status === "accepted" && Boolean(r.undo_open), runId: (r.run_id as string | null) ?? null, expiresAt: iso(r.expires_at)!, createdAt: iso(r.created_at)!,
    }];
  }).slice(0, f.limit ?? 200);
}

export const getSuggestion = async (v: Viewer, id: string) => (await listSuggestions(v, { id, limit: 1 }))[0] ?? null;
