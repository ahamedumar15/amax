import { sql } from "drizzle-orm";
import type { EventHandlerDef } from "@amax/core";
import type { Tx } from "@amax/db";
import { setProposalHours } from "@amax/delivery/contracts";
import { EVENTS, type EntryCorrected } from "../contracts";

/**
 * 081 AC-4: approved hours per proposal, handed to Delivery for its proposal views. Delivery can't read Time (Time
 * depends on Delivery, and the module graph has no cycles), so Time recomputes whole projects and Delivery stores the
 * totals it is given. Totals only: approved weeks, never a deleted entry; a proposal with none reads 0.
 */
export async function refreshProposalHours(tx: Tx, projectIds: string[]) {
  const projects = [...new Set(projectIds.filter(Boolean))];
  if (!projects.length) return;
  const rows = await tx.execute(sql`select e.proposal_id, sum(e.hours) as hours from time.entry e join time.week w on w.id = e.week_id
    where w.status = 'approved' and e.deleted_at is null and e.proposal_id is not null
      and e.project_id::text in (${sql.join(projects.map((id) => sql`${id}`), sql`, `)})
    group by e.proposal_id`);
  await setProposalHours(tx, projects, new Map(rows.map((r) => [r.proposal_id as string, Number(r.hours)])));
}

const weekProjectIds = async (tx: Tx, weekId: string) =>
  (await tx.execute(sql`select distinct project_id from time.entry where week_id = ${weekId}`)).map((r) => r.project_id as string);

type Payload = Record<string, unknown>;
const always = () => true;
const locked = (p: Payload) => p.lockedChange === true;

const refreshWeek = (id: string, event: string, when: (p: Payload) => boolean, extra: (p: Payload) => string[] = () => []): EventHandlerDef => ({
  id, event,
  async handle({ tx, event: e }) {
    const p = e.payload as Payload;
    if (when(p)) await refreshProposalHours(tx, [...(await weekProjectIds(tx, p.weekId as string)), ...extra(p)]);
  },
});

/** Approved totals move when a week is approved or reopened, or when an entry of an approved week changes (lockedChange). */
export const proposalHoursHandlers: EventHandlerDef[] = [
  refreshWeek("time.proposal-hours.approved", EVENTS.weekApproved, always),
  refreshWeek("time.proposal-hours.reopened", EVENTS.weekReopened, always),
  refreshWeek("time.proposal-hours.logged", EVENTS.entryLogged, locked),
  refreshWeek("time.proposal-hours.corrected", EVENTS.entryCorrected, locked, (p) => [(p as unknown as EntryCorrected).before.projectId]),
  refreshWeek("time.proposal-hours.deleted", EVENTS.entryDeleted, locked),
];
