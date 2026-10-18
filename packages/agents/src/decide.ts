import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { can, ScopeError, viewerOf } from "@amax/auth";
import { appendAudit, defineService, redact, getRuntime, type ServiceContext } from "@amax/core/server";
import { kindOf, SuggestionError, undoUntil, type KindWrite, type SuggestionKind } from "./kinds";
import { DECIDE, lockRow, personOf, type Row } from "./store";

type Kind = SuggestionKind<unknown, unknown>;
type Accepted = { id: string; status: "approved" | "accepted"; needs?: string; undoUntil?: string | null };

/** Only a person decides, and only inside their data scope for the kind's permission (006 AC-2, AC-5). */
export function decider(ctx: ServiceContext, row: Row, kind: Kind) {
  const v = viewerOf(ctx);
  const me = personOf(ctx);
  if (!v || !me) throw new SuggestionError("a person must decide a suggestion, not an agent or a service credential");
  if (!can(v, kind.permission, row.scope)) throw new ScopeError(kind.permission);
  return me;
}

const live = (row: Row) => {
  if (row.expired) throw new SuggestionError("that suggestion has expired; ask the agent for a fresh one");
};

/** The module's write, audited under its own action as the person, naming the suggestion and the agent. */
export async function auditWrite(tx: Tx, ctx: ServiceContext, kind: Kind, row: Row, w: KindWrite<unknown>) {
  const via = { suggestionId: row.id, agent: row.agent, agentName: row.agent_name, actsFor: row.acts_for };
  const fields = Object.fromEntries(Object.entries(kind.fields ?? {}).filter(([, c]) => c)) as Record<string, never>;
  const key = getRuntime().auditKey;
  await appendAudit(tx, ctx, { action: w.action, resource: w.resource, resourceId: w.resourceId, before: redact(w.before, fields, key), after: { ...redact(w.after, fields, key), via } });
  for (const e of w.events ?? []) await tx.execute(sql`insert into core.event (tenant_id, name, payload) values (${ctx.tenantId}, ${e.name}, ${JSON.stringify(e.payload)}::jsonb)`);
}

const decided = (id: string, decision: string, kind: string) => ({ name: "agents.suggestion.decided", payload: { suggestionId: id, decision, kind } });
const who = (row: Row, me: string, decision: string) => ({ decision, by: me, agent: row.agent, agentName: row.agent_name, actsFor: row.acts_for, kind: row.kind });

// Accepting is the only decision that changes data. Sensitive kinds need someone other than the person
// the agent acted for; irreversible ones need two different people, the second of whom runs it.
export const acceptSuggestion = defineService({
  scoped: true,
  name: "agents.suggestion.accept",
  action: DECIDE,
  resource: "agents.suggestion",
  input: z.object({ id: z.uuid() }),
  async run(tx, { id }, ctx) {
    const row = await lockRow(tx, id, ["open", "queried", "approved"]);
    live(row);
    const kind = kindOf(row.kind);
    const me = decider(ctx, row, kind);
    if (kind.sensitive && me === row.acts_for) throw new SuggestionError("someone other than the person the agent acted for must approve this");
    if (kind.irreversible && row.status !== "approved") {
      await tx.execute(sql`update agents.suggestion set status = 'approved', first_approved_by = ${me}, first_approved_at = now(), updated_at = now() where id = ${id}`);
      return { result: { id, status: "approved", needs: "a second approver: this can't be undone" } as Accepted, resourceId: id, before: { status: row.status }, after: who(row, me, "approved") };
    }
    if (kind.irreversible && row.first_approved_by === me) throw new SuggestionError("a second, different person must approve this: it can't be undone");
    const w = await kind.apply(tx, ctx, row.proposed);
    await auditWrite(tx, ctx, kind, row, w);
    const until = undoUntil(kind, row.proposed, w.applied);
    await tx.execute(sql`update agents.suggestion set status = 'accepted', decided_by = ${me}, decided_at = now(), applied = ${JSON.stringify(w.applied ?? null)}::jsonb,
      undo_until = ${until?.toISOString() ?? null}, updated_at = now() where id = ${id}`);
    return { result: { id, status: "accepted", undoUntil: until?.toISOString() ?? null } as Accepted, resourceId: id, before: { status: row.status }, after: { ...who(row, me, "accepted"), secondApprover: kind.irreversible ? me : undefined }, events: [decided(id, "accepted", row.kind)] };
  },
});

const close = (decision: "queried" | "dismissed") => defineService({
  scoped: true,
  name: `agents.suggestion.${decision === "queried" ? "query" : "dismiss"}`,
  action: DECIDE,
  resource: "agents.suggestion",
  input: z.object({ id: z.uuid(), note: z.string().min(2).max(1000).optional() }),
  async run(tx, { id, note }, ctx) {
    const row = await lockRow(tx, id, decision === "queried" ? ["open", "queried"] : ["open", "queried", "approved"]);
    if (decision === "queried") live(row);
    const me = decider(ctx, row, kindOf(row.kind));
    if (decision === "queried" && !note) throw new SuggestionError("say what you want the agent to check");
    await tx.execute(sql`update agents.suggestion set status = ${decision}, query_note = coalesce(${note ?? null}, query_note), decided_by = ${decision === "dismissed" ? me : null}, decided_at = ${decision === "dismissed" ? sql`now()` : null}, updated_at = now() where id = ${id}`);
    const events = decision === "dismissed" ? [decided(id, "dismissed", row.kind)] : [{ name: "agents.suggestion.queried", payload: { suggestionId: id, kind: row.kind } }];
    return { result: { id, status: decision }, resourceId: id, before: { status: row.status }, after: { ...who(row, me, decision), note: note ?? null }, events };
  },
});

export const querySuggestion = close("queried");
export const dismissSuggestion = close("dismissed");
