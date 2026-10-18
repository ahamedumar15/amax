import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { mayAct } from "./guard";
import { actorOf, lockApplication } from "./read";

const MANAGE = "recruitment:candidate:manage";

// 023 AC-1: an interview round is scheduled, then its outcome recorded, by a person. The card shows
// rounds done of rounds planned and the next one's time.
export const recordInterview = defineService({
  scoped: true,
  name: "recruitment.interview.record",
  action: MANAGE,
  resource: "recruitment.interview",
  input: z.object({
    applicationId: z.uuid(), round: z.number().int().min(1).max(6),
    at: z.iso.datetime({ offset: true }).optional().describe("When the round is, with its time zone, e.g. 2026-10-22T10:00:00+05:30"),
    outcome: z.enum(["passed", "failed"]).optional(),
  }),
  async run(tx, input, ctx) {
    const a = await lockApplication(tx, input.applicationId);
    mayAct(ctx, MANAGE, a.legal_entity_id as string);
    if (a.stage !== "interview") throw new Error("move the application to interviews first");
    if (input.round > Number(a.rounds)) throw new Error(`this role plans ${a.rounds} rounds`);
    const [had] = await tx.execute(sql`select * from recruitment.interview where application_id = ${input.applicationId} and round = ${input.round}`);
    if (!had && !input.at) throw new Error("say when the round is to schedule it");
    const by = actorOf(ctx);
    const [r] = await tx.execute(sql`insert into recruitment.interview (tenant_id, application_id, round, scheduled_at, outcome, recorded_by)
      values (${ctx.tenantId}, ${input.applicationId}, ${input.round}, ${input.at ?? had?.scheduled_at}, ${input.outcome ?? null}, ${by})
      on conflict (application_id, round) do update set scheduled_at = excluded.scheduled_at,
        outcome = coalesce(${input.outcome ?? null}, recruitment.interview.outcome), recorded_by = ${by} returning id, scheduled_at, outcome`);
    return { result: { interviewId: r.id as string, round: input.round, at: new Date(r.scheduled_at as string).toISOString(), outcome: (r.outcome as string | null) ?? null }, resourceId: r.id as string,
      before: had ? { at: had.scheduled_at, outcome: had.outcome } : null, after: { round: input.round, at: r.scheduled_at, outcome: r.outcome } };
  },
});
