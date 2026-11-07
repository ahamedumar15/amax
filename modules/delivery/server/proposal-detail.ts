import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, provided } from "@amax/core/server";
import { EVENTS, PROPOSAL_TIME_SLOT, proposalHref, type ProposalTimeLine, type ProposalTimeSource } from "../contracts";
import { day } from "../pins";
import { byLine } from "./activity";
import { proposalWhere, type ProposalRow } from "./queries";
import { invalid } from "./refusal";

export type ProposalTask = { id: string; ref: string; title: string; done: boolean; doneAt: string | null };
export type ProposalStage = { environment: string; environmentId: string; deploymentId: string | null; isProd: boolean; status: string | null; at: string | null };
// 081 amendment 4 (AC-50): each line's kind picks its icon on the timeline; a move also says the phase it entered (AC-47).
export type EventKind = "created" | "moved" | "task" | "reopened" | "time" | "edited" | "withdrawn" | "synced";
/** `id` names the line within its proposal (review round 1, R3: each line pins through get_proposal_event). */
export type ProposalEvent = { id: string; at: string; text: string; by: string; kind: EventKind; to?: string };
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
  "delivery.task.reopen": (a) => `${a.ref as string} ${a.title as string} reopened`,
};
const KIND_OF: Record<string, EventKind> = {
  "delivery.proposal.create": "created", "delivery.proposal.sync": "synced", "delivery.proposal.rekey": "edited", "delivery.proposal.update": "edited",
  "delivery.proposal.withdraw": "withdrawn", "delivery.task.add": "task", "delivery.task.reopen": "reopened",
};
const LABEL: Record<string, string> = { proposed: "Proposed", planned: "Planned", building: "Building", verified: "Verified", released: "Released" };

// 081 AC-28 (NFR-3): time logged against the proposal (log, correct, delete, and a change request applied by an approver),
// by its id, never its key, so a rekey keeps them. Time decides which lines this viewer may see, by its own rule (the
// entry's owner, or an approver of the project in the owner's entity, Q8), and fills PROPOSAL_TIME_SLOT with them;
// everyone else has the approved total (D2). Delivery only words them. Review round 1: no second copy of Time's rule here.
const hrs = (n: unknown) => `${Number(Number(n).toFixed(2))} h`;

async function timeRows(tx: Tx, id: string, v: Viewer, projectId: string): Promise<ProposalTimeLine[]> {
  const sources = provided<ProposalTimeSource>(PROPOSAL_TIME_SLOT);
  return (await Promise.all(sources.map((source) => source(tx, v, { id, projectId })))).flat();
}

function timeText(a: ProposalTimeLine, id: string, owner: string) {
  const when = a.day ? ` for ${day(`${a.day}T12:00:00Z`)}` : "";
  if (a.deleted) return `Removed ${owner}'s ${hrs(a.hours)}${when}`;
  if (!("previousProposalId" in a)) return `${owner} logged ${hrs(a.hours)}${when}`;
  if (a.proposalId !== id) return `Moved ${owner}'s ${hrs(a.hours)}${when} off this proposal`;
  if (a.previousProposalId !== id) return `Put ${owner}'s ${hrs(a.hours)}${when} on this proposal`;
  return `Corrected ${owner}'s entry${when} to ${hrs(a.hours)}`;
}

async function historyOf(tx: Tx, id: string, v: Viewer, projectId: string): Promise<ProposalEvent[]> {
  const audits = await tx.execute(sql`select seq, occurred_at as at, actor, on_behalf_of, action, after from core.audit_event
    where resource in ('delivery.proposal', 'delivery.task') and (resource_id = ${id} or (resource = 'delivery.task' and after->>'proposalId' = ${id})) order by occurred_at desc, seq desc limit 100`);
  const moves = await tx.execute(sql`select id, created_at as at, payload from core.event where name = ${EVENTS.proposalPhaseChanged} and payload->>'proposalId' = ${id} order by created_at desc limit 100`);
  const time = await timeRows(tx, id, v, projectId);
  // Closed tasks come from the task rows: who closed each is on the row ("user:…", or "agent:… for user:…").
  const closed = await tx.execute(sql`select id, ref, title, done_at as at, done_by from delivery.task where proposal_id = ${id} and done and done_at is not null`);
  const ids = new Set<string>();
  const add = (s: unknown) => { for (const m of String(s ?? "").matchAll(/(?:user|sp):([0-9a-f-]{36})/g)) ids.add(m[1]); };
  for (const a of audits) { add(a.actor); add(a.on_behalf_of); }
  for (const t of time) { add(t.actor); add(t.onBehalfOf); add(`user:${t.userId}`); }
  for (const m of moves) add((m.payload as { by: string }).by);
  for (const t of closed) add(t.done_by);
  const names = new Map((await tx.execute(sql`select id::text as id, name from auth.user where id::text in (${sql.join([...ids, ""].map((x) => sql`${x}`), sql`, `)})
    union all select id::text, name from auth.service_principal where id::text in (${sql.join([...ids, ""].map((x) => sql`${x}`), sql`, `)})`)).map((r) => [r.id as string, r.name as string]));
  const lines: ProposalEvent[] = [
    ...audits.filter((a) => ACTION[a.action as string]).map((a) => ({ id: `audit:${String(a.seq)}`, at: iso(a.at)!, text: ACTION[a.action as string]((a.after as Record<string, unknown>) ?? {}), by: who(a.actor as string, a.on_behalf_of as string | null, names), kind: KIND_OF[a.action as string] })),
    ...time.map((t) => ({ id: t.id, at: iso(t.at)!, text: timeText(t, id, names.get(t.userId) ?? "Someone"), by: who(t.actor, t.onBehalfOf, names), kind: "time" as const })),
    ...moves.map((m) => {
      const p = m.payload as { from: string; to: string; by: string };
      const [actor, forUser] = p.by.split(" for ");
      return { id: `event:${m.id as string}`, at: iso(m.at)!, text: `Moved ${LABEL[p.from] ?? p.from} → ${LABEL[p.to] ?? p.to}`, by: who(actor, forUser ?? null, names), kind: "moved" as const, to: p.to };
    }),
    ...closed.map((t) => {
      const [actor, forUser] = String(t.done_by ?? "").split(" for ");
      return { id: `task:${t.id as string}`, at: iso(t.at)!, text: `${t.ref as string} ${t.title as string} done`, by: who(actor || null, forUser ?? null, names), kind: "task" as const };
    }),
  ];
  return lines.sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Review 081 round 1 (R3): one line of a proposal's history, for its pin. Read through the whole page as this viewer sees
 * it, so a time line follows Time's rule here too; null when the line isn't there (or isn't theirs to see).
 */
export async function proposalEvent(v: Viewer, a: { proposalId: string; line: string }) {
  const p = await proposalDetail(v, { proposalId: a.proposalId });
  const e = p?.history.find((h) => h.id === a.line);
  return p && e ? { ...e, line: e.id, proposalId: p.id, key: p.key, title: p.title } : null;
}

/** 081 AC-6, AC-8: one proposal with its project, tasks, release stages and history; null when there is none. */
export const proposalDetail = (v: Viewer, ref: { proposalId?: string; key?: string }) => {
  if (!ref.proposalId && !ref.key) throw invalid("say which proposal: a proposalId or a key");
  if (!can(v, "delivery:read")) throw new ForbiddenError("delivery:read", "delivery");
  return withTenant(getRuntime().db, v.tenantId, async (tx): Promise<ProposalDetail | null> => {
    const row = await proposalWhere(tx, ref);
    if (!row) return null;
    const [p] = await tx.execute(sql`select p.project_id, p.release_id, p.withdrawn_at, p.withdraw_reason, p.released_at, p.source_ref, pr.key, pr.name, pr.status
      from delivery.proposal p join delivery.project pr on pr.id = p.project_id where p.id = ${row.id}`);
    const tasks = (await tx.execute(sql`select id, ref, title, done, done_at from delivery.task where proposal_id = ${row.id} order by length(ref), ref`))
      .map((t) => ({ id: t.id as string, ref: t.ref as string, title: t.title as string, done: Boolean(t.done), doneAt: iso(t.done_at) }));
    const stages = p.release_id ? (await tx.execute(sql`select e.id as environment_id, e.name, e.is_prod, d.id as deployment_id, d.status, d.at from delivery.environment e
        left join lateral (select id, status, at from delivery.deployment where release_id = ${p.release_id} and environment_id = e.id and voided_at is null order by at desc limit 1) d on true
        where e.project_id = ${p.project_id} order by e.position`)).map((e) => ({ environment: e.name as string, environmentId: e.environment_id as string, deploymentId: (e.deployment_id as string | null) ?? null, isProd: Boolean(e.is_prod), status: (e.status as string | null) ?? null, at: iso(e.at) })) : [];
    return { ...row, href: proposalHref(row.key), project: { id: p.project_id as string, key: p.key as string, name: p.name as string, status: p.status as string },
      withdrawnAt: iso(p.withdrawn_at), withdrawReason: (p.withdraw_reason as string | null) ?? null, releasedAt: iso(p.released_at), sourceRef: (p.source_ref as string | null) ?? null,
      tasks, stages, history: await historyOf(tx, row.id, v, p.project_id as string) };
  });
};
