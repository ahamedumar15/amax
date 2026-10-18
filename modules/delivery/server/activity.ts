import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import type { ActivityItem } from "@amax/core";
import { ForbiddenError, getRuntime, type ServiceContext } from "@amax/core/server";

// 008 AC-4: one feed line per thing ingestion recorded, written in the same transaction as the write
// it describes. Who did it stays an id; the label is built from today's names when it is read.

const userOf = (id: string | undefined) => (id?.startsWith("user:") ? id.slice(5) : null);

export async function recordActivity(tx: Tx, ctx: ServiceContext, line: { projectId?: string | null; text: string; detail?: string | null }) {
  const forUser = ctx.actor.kind === "user" ? null : userOf(ctx.onBehalfOf);
  await tx.execute(sql`insert into delivery.activity (tenant_id, actor_id, actor_kind, for_user_id, project_id, text, detail)
    values (${ctx.tenantId}, ${ctx.actor.id}, ${ctx.actor.kind}, ${forUser}, ${line.projectId ?? null}, ${line.text}, ${line.detail ?? null})`);
}

// An agent's id is "agent:<name>"; Claude is the assistant's name, other agents (specclaw) keep theirs.
const agentName = (id: string) => {
  const name = id.startsWith("agent:") ? id.slice(6) : id;
  return name === "claude" || !name ? "Claude" : name;
};

const first = (name: unknown) => (typeof name === "string" && name ? name.split(/\s+/)[0] : null);

// "Claude for Nimal" for an agent, "<credential> for Nimal" for a service credential, the person's
// first name when they did it themselves, as in the 001 mock.
export function byLine(r: { actor_kind: string; actor_id: string; actor_name: unknown; principal_name: unknown; for_name: unknown }) {
  const forWhom = first(r.for_name);
  const suffix = forWhom ? ` for ${forWhom}` : "";
  if (r.actor_kind === "agent") return `${agentName(r.actor_id)}${suffix}`;
  if (r.actor_kind === "service") return `${(r.principal_name as string | null) ?? "A service credential"}${suffix}`;
  if (r.actor_kind === "system") return `amax${suffix}`;
  return first(r.actor_name) ?? "Someone";
}

const item = (r: Record<string, unknown>): ActivityItem => {
  const by = byLine(r as never);
  return {
    id: r.id as string, at: new Date(r.at as string).toISOString(), by, agent: r.actor_kind !== "user", text: r.text as string, detail: (r.detail as string | null) ?? null,
    pin: { label: `${by} ${r.text as string}`.slice(0, 80), tool: "get_activity", args: { id: r.id as string } },
  };
};

const select = (where: ReturnType<typeof sql>, limit: number) => sql`select a.*, au.name as actor_name, sp.name as principal_name, fu.name as for_name
  from delivery.activity a
  left join auth.user au on a.actor_kind = 'user' and au.id::text = substr(a.actor_id, 6)
  left join auth.service_principal sp on a.actor_kind = 'service' and sp.id::text = substr(a.actor_id, 4)
  left join auth.user fu on fu.id = a.for_user_id
  where ${where} order by a.at desc limit ${limit}`;

const read = <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, "delivery:read")) throw new ForbiddenError("delivery:read", "delivery");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

/** The newest feed lines (the Overview card). */
export const listActivity = (viewer: Viewer, limit = 8) => read(viewer, async (tx) => (await tx.execute(select(sql`true`, Math.min(Math.max(limit, 1), 50)))).map(item));

/** One feed line, for its pin. */
export const getActivity = (viewer: Viewer, id: string) => read(viewer, async (tx) => (await tx.execute(select(sql`a.id = ${id}`, 1))).map(item)[0] ?? null);
