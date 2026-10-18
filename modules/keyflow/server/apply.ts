import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { ServiceContext } from "@amax/core/server";
import { listPeople } from "@amax/hr/contracts";
import { raise, resolve, type SyncProblem } from "./errors";
import type { Sent } from "./plan";
import { InGoal, InRecognition, InReview, type ChangesReply, type PushReply } from "./transport";

export type Outcome = { sent: Sent[]; refused: PushReply["refused"]; changes: ChangesReply };
export type Counts = { peopleOut: number; teamsOut: number; goalsIn: number; reviewsIn: number; recognitionIn: number; errors: number };

const UPSERT = {
  goal: (t: string, p: string, g: InGoal) => sql`insert into keyflow.goal (tenant_id, person_id, external_id, title, status, progress, due_on, period)
    values (${t}, ${p}, ${g.id}, ${g.title}, ${g.status}, ${g.progress}, ${g.dueOn}, ${g.period}) on conflict (tenant_id, external_id) do update set person_id = excluded.person_id,
    title = excluded.title, status = excluded.status, progress = excluded.progress, due_on = excluded.due_on, period = excluded.period, updated_at = now()`,
  review: (t: string, p: string, r: InReview) => sql`insert into keyflow.review_score (tenant_id, person_id, external_id, cycle, score, scale, rating, reviewed_on)
    values (${t}, ${p}, ${r.id}, ${r.cycle}, ${r.score}, ${r.scale}, ${r.rating}, ${r.reviewedOn}) on conflict (tenant_id, external_id) do update set person_id = excluded.person_id,
    cycle = excluded.cycle, score = excluded.score, scale = excluded.scale, rating = excluded.rating, reviewed_on = excluded.reviewed_on, updated_at = now()`,
  recognition: (t: string, p: string, k: InRecognition) => sql`insert into keyflow.recognition (tenant_id, person_id, external_id, from_name, message, given_on)
    values (${t}, ${p}, ${k.id}, ${k.fromName}, ${k.message}, ${k.givenOn}) on conflict (tenant_id, external_id) do update set person_id = excluded.person_id,
    from_name = excluded.from_name, message = excluded.message, given_on = excluded.given_on, updated_at = now()`,
};
const KINDS = [["goal", InGoal, "goals", "A goal"], ["review", InReview, "reviews", "A review score"], ["recognition", InRecognition, "recognition", "A recognition"]] as const;

/** Records one sync's outcome in the run `runId`: links for what Keyflow took, errors for what it refused or sent unreadable or unmatched, and the records that came in. */
export async function applyOutcome(tx: Tx, ctx: ServiceContext, runId: string, o: Outcome, by: string): Promise<Counts> {
  const names = new Map((await listPeople(tx, ctx)).map((p) => [p.id, p.name]));
  const refused = new Map(o.refused.map((r) => [r.ref, r.reason]));
  const problems: SyncProblem[] = o.refused.map((r) => ({ key: `refused:${r.ref}`, kind: "refused", personId: names.has(r.ref) ? r.ref : null, personName: names.get(r.ref) ?? null, externalRef: r.ref, message: `Keyflow refused this person: ${r.reason}` }));
  const taken = o.sent.filter((s) => s.kind === "team" || !refused.has(s.localId));
  for (const s of taken) await tx.execute(sql`insert into keyflow.link (tenant_id, kind, local_id, hash) values (${ctx.tenantId}, ${s.kind}, ${s.localId}, ${s.hash})
    on conflict (tenant_id, kind, local_id) do update set hash = excluded.hash, sent_at = now()`);
  await resolve(tx, taken.filter((s) => s.kind === "person").map((s) => `refused:${s.localId}`), by);
  const counts: Counts = { peopleOut: taken.filter((s) => s.kind === "person").length, teamsOut: taken.filter((s) => s.kind === "team").length, goalsIn: 0, reviewsIn: 0, recognitionIn: 0, errors: 0 };
  for (const [kind, schema, field, noun] of KINDS) {
    for (const [i, raw] of o.changes[field].entries()) {
      const r = schema.safeParse(raw);
      if (!r.success) { problems.push({ key: `invalid:${kind}:${(raw as { id?: unknown })?.id ?? i}`, kind: "invalid", message: `${noun} from Keyflow wasn't in the expected shape` }); continue; }
      if (!names.has(r.data.personRef)) { problems.push({ key: `unmatched:${r.data.personRef}`, kind: "unmatched", externalRef: r.data.personRef, message: `${noun} came in for a Keyflow person amax doesn't know` }); continue; }
      await tx.execute(UPSERT[kind](ctx.tenantId, r.data.personRef, r.data as never));
      counts[`${field}In`]++;
    }
  }
  const unique = [...new Map(problems.map((p) => [p.key, p])).values()];
  for (const p of unique) await raise(tx, ctx.tenantId, runId, p);
  return { ...counts, errors: unique.length };
}
