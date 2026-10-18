import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { mask, type Masked, type Viewer } from "@amax/auth";
import type { Stage } from "../contracts";
import type { MatchEvidence } from "./match";
import { dayOf, initialsOf, iso, levelOf } from "./read";

/** One application as the screen and the read tools show it: candidate fields masked below HR (002). */
export type AppRow = {
  id: string; roleId: string; roleTitle: string; legalEntityId: string; stage: Stage; source: string;
  name: string | Masked; initials: string | Masked; email: string | null | Masked; evidence: MatchEvidence[] | Masked;
  agentScore: number | null; matchScore: number | null; appliedAt: string; screenedAt: string | null; interviewedAt: string | null; offeredAt: string | null; hiredAt: string | null; closedAt: string | null;
  rounds: number; roundsDone: number; nextInterview: string | null;
  offer: { id: string; provider: string; status: string; sentAt: string; startsOn: string } | null;
  hrConfirmed: boolean; inHr: boolean;
};

const ROWS = sql`select a.*, r.title as role_title, c.name, c.email, c.source,
    (select count(*) from recruitment.interview i where i.application_id = a.id and i.outcome is not null)::int as rounds_done,
    (select min(i.scheduled_at) from recruitment.interview i where i.application_id = a.id and i.outcome is null) as next_interview,
    o.id as offer_id, o.provider, o.status as offer_status, o.sent_at, o.starts_on
  from recruitment.application a join recruitment.role r on r.id = a.role_id join recruitment.candidate c on c.id = a.candidate_id
  left join lateral (select * from recruitment.offer x where x.application_id = a.id order by x.sent_at desc limit 1) o on true`;

const FIELDS = { name: "candidate", initials: "candidate", email: "candidate", evidence: "candidate" } as const;

function toRow(v: Viewer, r: Record<string, unknown>): AppRow {
  const full = {
    id: r.id as string, roleId: r.role_id as string, roleTitle: r.role_title as string, legalEntityId: r.legal_entity_id as string, stage: r.stage as Stage, source: r.source as string,
    name: r.name as string, initials: initialsOf(r.name as string), email: (r.email as string | null) ?? null, evidence: (r.agent_evidence as MatchEvidence[]) ?? [],
    agentScore: r.agent_score === null ? null : Number(r.agent_score), matchScore: r.match_score === null ? null : Number(r.match_score),
    appliedAt: iso(r.applied_at)!, screenedAt: iso(r.screened_at), interviewedAt: iso(r.interviewed_at), offeredAt: iso(r.offered_at), hiredAt: iso(r.hired_at), closedAt: iso(r.closed_at),
    rounds: Number(r.rounds), roundsDone: Number(r.rounds_done), nextInterview: iso(r.next_interview),
    offer: r.offer_id ? { id: r.offer_id as string, provider: r.provider as string, status: r.offer_status as string, sentAt: iso(r.sent_at)!, startsOn: dayOf(r.starts_on)! } : null,
    hrConfirmed: Boolean(r.hr_confirmed_at), inHr: Boolean(r.person_id),
  };
  return mask(v, full, FIELDS, { legalEntityId: full.legalEntityId }) as AppRow;
}

/** Applications the viewer may read, optionally for one role or one application. */
export async function appRows(tx: Tx, v: Viewer, where: { roleId?: string; applicationId?: string } = {}) {
  const filter = where.applicationId ? sql`where a.id = ${where.applicationId}` : where.roleId ? sql`where a.role_id = ${where.roleId}` : sql``;
  return (await tx.execute(sql`${ROWS} ${filter} order by a.applied_at`)).filter((r) => levelOf(v, r.legal_entity_id as string)).map((r) => toRow(v, r));
}
