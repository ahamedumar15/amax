import { sql } from "drizzle-orm";
import type { ProposalTimeLine, ProposalTimeSource } from "@amax/delivery/contracts";
import { entitiesOf } from "./chain";
import { mayFix } from "./entry";

type After = { proposalId?: string | null; previousProposalId?: string | null; userId?: string; day?: string; hours?: number; deleted?: boolean };

/**
 * 081 AC-28, review round 1: the time lines on a proposal's page, which Time fills in Delivery's PROPOSAL_TIME_SLOT. From
 * Time's own audit rows (log, correct, delete, and a change request applied by an approver), by the proposal's id, so a
 * rekey keeps them. A viewer sees a line by the rule every other path about an entry uses (mayFix): the entry's owner,
 * or an approver of the project in the owner's legal entity (071 AC-4). One rule, Time's, never a copy in Delivery.
 */
export const proposalTimeLines: ProposalTimeSource = async (tx, v, proposal) => {
  const rows = await tx.execute(sql`select seq, occurred_at as at, actor, on_behalf_of, after from core.audit_event
    where resource in ('time.entry', 'time.change_request') and (after->>'proposalId' = ${proposal.id} or after->>'previousProposalId' = ${proposal.id})
    order by occurred_at desc, seq desc limit 100`);
  const owners = await entitiesOf(tx, rows.map((r) => (r.after as After).userId ?? "").filter(Boolean));
  return rows.flatMap((r): ProposalTimeLine[] => {
    const a = r.after as After;
    if (!a.userId || !mayFix(v, a.userId, proposal.projectId, owners.get(a.userId) ?? null)) return [];
    return [{ id: `time:${String(r.seq)}`, at: new Date(r.at as string).toISOString(), actor: r.actor as string, onBehalfOf: (r.on_behalf_of as string | null) ?? null, userId: a.userId,
      day: a.day ?? null, hours: Number(a.hours ?? 0), proposalId: a.proposalId ?? null,
      ...("previousProposalId" in a ? { previousProposalId: a.previousProposalId ?? null } : {}), ...(a.deleted ? { deleted: true } : {}) }];
  });
};
