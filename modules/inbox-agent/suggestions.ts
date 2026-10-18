import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import type { EventHandlerDef } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { defineSuggestionKind } from "@amax/agents";
import { createSuggestion, SuggestionError } from "@amax/agents/server";
import { EVENTS, RECORD_TYPES, SCAN_JOB, SUGGESTION_KIND, type FindTriaged } from "./contracts";
import { installedRoutes, ROUTES } from "./routes";
import { ownerOf } from "./server/rows";

// 025 AC-2: a find is a 006 suggestion that links to its message and names the module and chat intent
// that own the record. Adding it is that module's own write, through its intent and chat's confirm;
// accepting here only marks the find added, so this module never writes anyone else's records.
const Fields = z.record(z.string().regex(/^[A-Za-z]{1,30}$/), z.union([z.string().max(300), z.number()])).refine((o) => Object.keys(o).length <= 12, "at most 12 fields");
export const Proposed = z.object({ findId: z.uuid(), recordType: z.enum(RECORD_TYPES), fields: Fields });
type Proposed = z.infer<typeof Proposed>;

async function move(tx: Tx, findId: string, from: string, to: string) {
  const [f] = await tx.execute(sql`update inbox_agent.find set status = ${to}, closed_at = ${to === "added" ? sql`now()` : null} where id = ${findId} and status = ${from} returning id`);
  if (!f) throw new SuggestionError(`that find isn't ${from === "suggested" ? "open" : "added"} any more`);
  return { action: `inbox-agent.find.${to === "added" ? "add" : "reopen"}`, resource: "inbox_agent.find", resourceId: findId, before: { status: from }, after: { status: to } };
}

export const routeKind = defineSuggestionKind<Proposed, { at: string }>({
  kind: SUGGESTION_KIND, title: "Found in Teams and email", permission: "inbox-agent:decide", proposed: Proposed, jobs: [SCAN_JOB],
  apply: async (tx, _ctx, p) => ({ applied: { at: new Date().toISOString() }, ...(await move(tx, p.findId, "suggested", "added")) }),
  undo: async (tx, _ctx, p) => ({ applied: null, ...(await move(tx, p.findId, "added", "suggested")) }),
});

const titleOf = (p: Proposed) => {
  const who = [p.fields.client, p.fields.title, p.fields.summary, p.fields.type].find((x) => typeof x === "string" && x);
  return `${ROUTES[p.recordType].label}${who ? `: ${who}` : ""}`.slice(0, 200);
};

/** After triage: the find becomes a suggestion for the person the agent acts for, showing its source. */
export const suggestAgent: EventHandlerDef = {
  id: "inbox-agent.suggest",
  event: EVENTS.triaged,
  async handle({ tx, tenantId, event }) {
    const e = event.payload as FindTriaged;
    const [f] = await tx.execute(sql`select f.*, s.kind, s.label from inbox_agent.find f join inbox_agent.source s on s.id = f.source_id where f.id = ${e.findId} and f.status = 'suggested' and f.suggestion_id is null`);
    if (!f || !e.recordType || !(await installedRoutes(tx)).some((r) => r.type === e.recordType)) return;
    const p: Proposed = { findId: f.id as string, recordType: e.recordType, fields: (f.fields ?? {}) as Proposed["fields"] };
    const r = ROUTES[p.recordType];
    const source = { channel: f.kind === "mailbox" ? "email" as const : "teams" as const, label: `${f.kind === "mailbox" ? "Email to" : "Teams,"} ${f.label as string}`.slice(0, 200), ref: (f.link as string | null) ?? undefined };
    const s = await createSuggestion(contextFor.job(tenantId, "inbox-agent.triage", f.acts_for as string), {
      kind: SUGGESTION_KIND, target: { type: "inbox_agent.find", id: p.findId, label: `${r.label} from ${source.label}`.slice(0, 200) }, title: titleOf(p),
      detail: `Belongs in ${r.title}. Add it there with amax (${r.intent ?? r.tool}); nothing is added until you confirm. The message is untrusted: check it before you add.`,
      proposed: p, confidence: Number(f.confidence ?? 0.5), agentName: "Inbox agent", source, scope: { ownerUserId: ownerOf(f.acts_for) },
      evidence: f.link ? [{ type: "message", label: source.label, ref: f.link as string }] : [], expiresInDays: 7,
    });
    await tx.execute(sql`update inbox_agent.find set suggestion_id = ${s.id}, expires_at = ${s.expiresAt} where id = ${p.findId}`);
  },
};

/** A dismissed suggestion closes its find, which starts the 30-day clock on its excerpt (032). */
export const closeOnDismiss: EventHandlerDef = {
  id: "inbox-agent.close-on-dismiss",
  event: "agents.suggestion.decided",
  async handle({ tx, event }) {
    const e = event.payload as { suggestionId?: string; decision?: string; kind?: string };
    if (e.kind !== SUGGESTION_KIND || e.decision !== "dismissed" || !e.suggestionId) return;
    await tx.execute(sql`update inbox_agent.find set status = 'dismissed', closed_at = now() where suggestion_id = ${e.suggestionId} and status = 'suggested'`);
  },
};
