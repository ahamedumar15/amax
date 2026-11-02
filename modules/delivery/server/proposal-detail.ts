import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime } from "@amax/core/server";
import { EVENTS, proposalHref } from "../contracts";
import { byLine } from "./activity";
import { proposalWhere, type ProposalRow } from "./queries";

export type ProposalTask = { ref: string; title: string; done: boolean; doneAt: string | null };
export type ProposalStage = { environment: string; isProd: boolean; status: string | null; at: string | null };
export type ProposalEvent = { at: string; text: string; by: string };
export type ProposalDetail = ProposalRow & {
  href: string;
  project: { id: string; key: string; name: string; status: string };
  withdrawnAt: string | null; withdrawReason: string | null; releasedAt: string | null; sourceRef: string | null;
  tasks: ProposalTask[]; stages: ProposalStage[]; history: ProposalEvent[];
};

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const KIND: Record<string, string> = { user: "user", agent: "agent", sp: "service" };

// "user:…", "agent:claude", "sp:…", "job:…": the actor's kind and the names byLine() writes "Claude for Nimal" from.
function who(actor: string | null, forUser: string | null, names: Map<string, string>) {
  const [prefix, id] = [(actor ?? "").split(":")[0], (actor ?? "").slice((actor ?? "").indexOf(":") + 1)];
  const kind = KIND[prefix] ?? "system";
  return byLine({ actor_kind: kind, actor_id: actor ?? "", actor_name: names.get(id), principal_name: names.get(id), for_name: forUser ? names.get(forUser.replace(/^user:/, "")) : null });
}

const ACTION: Record<string, (a: Record<string, unknown>) => string> = {
  "delivery.proposal.create": (a) => `Created${a.estimateHours ? `, estimate ${a.estimateHours} h` : ""}`,
  "delivery.proposal.sync": () => "Synced from the repo",
  "delivery.proposal.rekey": (a) => `Renamed to ${a.key as string}`,
  "delivery.proposal.update": (a) => `Edited ${Object.keys(a).join(", ")}`,
  "delivery.proposal.withdraw": (a) => `Withdrawn: ${a.reason as string}`,
  "delivery.task.add": (a) => `Added task ${a.ref as string} ${a.title as string}`,
};
const LABEL: Record<string, string> = { proposed: "Proposed", planned: "Planned", building: "Building", verified: "Verified", released: "Released" };

async function historyOf(tx: Tx, id: string): Promise<ProposalEvent[]> {
  const audits = await tx.execute(sql`select occurred_at as at, actor, on_behalf_of, action, after from core.audit_event
    where resource in ('delivery.proposal', 'delivery.task') and (resource_id = ${id} or (resource = 'delivery.task' and after->>'proposalId' = ${id})) order by occurred_at desc, seq desc limit 100`);
  const moves = await tx.execute(sql`select created_at as at, payload from core.event where name = ${EVENTS.proposalPhaseChanged} and payload->>'proposalId' = ${id} order by created_at desc limit 100`);
  const ids = new Set<string>();
  const add = (s: unknown) => { for (const m of String(s ?? "").matchAll(/(?:user|sp):([0-9a-f-]{36})/g)) ids.add(m[1]); };
  for (const a of audits) { add(a.actor); add(a.on_behalf_of); }
  for (const m of moves) add((m.payload as { by: string }).by);
  const names = new Map((await tx.execute(sql`select id::text as id, name from auth.user where id::text in (${sql.join([...ids, ""].map((x) => sql`${x}`), sql`, `)})
    union all select id::text, name from auth.service_principal where id::text in (${sql.join([...ids, ""].map((x) => sql`${x}`), sql`, `)})`)).map((r) => [r.id as string, r.name as string]));
  const lines: ProposalEvent[] = [
    ...audits.filter((a) => ACTION[a.action as string]).map((a) => ({ at: iso(a.at)!, text: ACTION[a.action as string]((a.after as Record<string, unknown>) ?? {}), by: who(a.actor as string, a.on_behalf_of as string | null, names) })),
    ...moves.map((m) => {
      const p = m.payload as { from: string; to: string; by: string };
      const [actor, forUser] = p.by.split(" for ");
      return { at: iso(m.at)!, text: `Moved ${LABEL[p.from] ?? p.from} → ${LABEL[p.to] ?? p.to}`, by: who(actor, forUser ?? null, names) };
    }),
  ];
  return lines.sort((a, b) => b.at.localeCompare(a.at));
}

/** 081 AC-6, AC-8: one proposal with its project, tasks, release stages and history; null when there is none. */
export const proposalDetail = (v: Viewer, ref: { proposalId?: string; key?: string }) => {
  if (!ref.proposalId && !ref.key) throw new Error("say which proposal: a proposalId or a key");
  if (!can(v, "delivery:read")) throw new ForbiddenError("delivery:read", "delivery");
  return withTenant(getRuntime().db, v.tenantId, async (tx): Promise<ProposalDetail | null> => {
    const row = await proposalWhere(tx, ref);
    if (!row) return null;
    const [p] = await tx.execute(sql`select p.project_id, p.release_id, p.withdrawn_at, p.withdraw_reason, p.released_at, p.source_ref, pr.key, pr.name, pr.status
      from delivery.proposal p join delivery.project pr on pr.id = p.project_id where p.id = ${row.id}`);
    const tasks = (await tx.execute(sql`select ref, title, done, done_at from delivery.task where proposal_id = ${row.id} order by length(ref), ref`))
      .map((t) => ({ ref: t.ref as string, title: t.title as string, done: Boolean(t.done), doneAt: iso(t.done_at) }));
    const stages = p.release_id ? (await tx.execute(sql`select e.name, e.is_prod, d.status, d.at from delivery.environment e
        left join lateral (select status, at from delivery.deployment where release_id = ${p.release_id} and environment_id = e.id and voided_at is null order by at desc limit 1) d on true
        where e.project_id = ${p.project_id} order by e.position`)).map((e) => ({ environment: e.name as string, isProd: Boolean(e.is_prod), status: (e.status as string | null) ?? null, at: iso(e.at) })) : [];
    return { ...row, href: proposalHref(row.key), project: { id: p.project_id as string, key: p.key as string, name: p.name as string, status: p.status as string },
      withdrawnAt: iso(p.withdrawn_at), withdrawReason: (p.withdraw_reason as string | null) ?? null, releasedAt: iso(p.released_at), sourceRef: (p.source_ref as string | null) ?? null,
      tasks, stages, history: await historyOf(tx, row.id) };
  });
};
