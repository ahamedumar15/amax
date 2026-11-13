import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { appendAudit, type Emitted, type ServiceContext } from "@amax/core/server";
import { EVENTS, type CommitTime } from "../contracts";
import { estimateDays } from "../sync/estimate";
import type { CommitInput } from "./push";

// 104 AC-4 to AC-8: hours from a change's commits, drafted for the person to accept. The sync writes a draft row (one
// per person, proposal and day) and raises the commit-time event Time turns into a timesheet suggestion; it never
// logs, submits or approves time. The commit's author is found by a verified git identity (AC-5), never by who pushed.

export type SyncTimeRecord = { proposalId: string; proposalKey: string; commits: CommitInput[] };
export type SyncTimeResult = { drafted: number; unlinked: number; events: Emitted[] };

/** Each email's person, through a verified git identity, as the push webhook attributes commits (008 AC-2). */
async function peopleOf(tx: Tx, emails: string[]) {
  if (!emails.length) return new Map<string, string>();
  const rows = await tx.execute(sql`select distinct on (lower(g.email)) lower(g.email) as email, g.user_id from auth.git_identity g join auth.user u on u.id = g.user_id
    where g.email_verified and u.status = 'active' and lower(g.email) in (${sql.join(emails.map((e) => sql`${e}`), sql`, `)}) order by lower(g.email), g.id`);
  return new Map(rows.map((r) => [r.email as string, r.user_id as string]));
}

/** 008 AC-6, 104 AC-6: for each person, the day commit time was switched on for their legal entity; absent when it's off. */
async function consentOf(tx: Tx, userIds: string[]) {
  if (!userIds.length) return new Map<string, string>();
  const rows = await tx.execute(sql`select u.id, to_char(c.notified_at at time zone 'UTC', 'YYYY-MM-DD') as since from auth.user u
    join delivery.commit_time c on c.legal_entity_id = u.legal_entity_id where c.enabled and c.notified_at is not null and u.id in (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`);
  return new Map(rows.map((r) => [r.id as string, r.since as string]));
}

/** 104 AC-7: commits whose hours the push webhook already drafted from a `Time:` line (0018) are left out. */
async function alreadyDrafted(tx: Tx, userId: string, ids: string[]) {
  const rows = await tx.execute(sql`select commit_id from delivery.commit_draft where user_id = ${userId} and commit_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  return new Set(rows.map((r) => r.commit_id as string));
}

export async function draftSyncTime(tx: Tx, ctx: ServiceContext, project: { id: string; key: string }, records: SyncTimeRecord[], today: string): Promise<SyncTimeResult> {
  const out: SyncTimeResult = { drafted: 0, unlinked: 0, events: [] };
  const emails = [...new Set(records.flatMap((r) => r.commits.map((c) => c.email.toLowerCase())))];
  const people = await peopleOf(tx, emails);
  const consent = await consentOf(tx, [...new Set(people.values())]);
  for (const r of records) {
    const byUser = new Map<string, CommitInput[]>();
    for (const c of r.commits) {
      const userId = people.get(c.email.toLowerCase());
      if (!userId) { out.unlinked++; continue; }
      byUser.set(userId, [...(byUser.get(userId) ?? []), c]);
    }
    for (const [userId, commits] of byUser) {
      const since = consent.get(userId);
      if (!since) continue;
      const skip = await alreadyDrafted(tx, userId, commits.map((c) => c.id));
      const days = estimateDays(commits.filter((c) => !skip.has(c.id)).map((c) => c.at)).filter((d) => d.day >= since && d.day < today);
      for (const d of days) {
        const [first] = await tx.execute(sql`insert into delivery.commit_day_draft (tenant_id, user_id, proposal_id, day, hours, commits)
          values (${ctx.tenantId}, ${userId}, ${r.proposalId}, ${d.day}, ${d.hours}, ${d.commits}) on conflict do nothing returning day`);
        if (!first) continue;
        const after = { proposalId: r.proposalId, userId, day: d.day, hours: d.hours, commits: d.commits };
        // 104 AC-11: the proposal's history says the hours were drafted; Time shows the line by its own rule.
        await appendAudit(tx, ctx, { action: "delivery.commit_time.draft", resource: "delivery.proposal", resourceId: r.proposalId, after });
        const payload: CommitTime = { userId, projectId: project.id, projectKey: project.key, proposalKey: r.proposalKey, day: d.day, hours: d.hours, commit: `${r.proposalKey}/${d.day}`, commits: d.commits };
        out.events.push({ name: EVENTS.commitTime, payload });
        out.drafted++;
      }
    }
  }
  return out;
}
