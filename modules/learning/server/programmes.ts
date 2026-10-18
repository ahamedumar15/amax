import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { EVENTS, KINDS, numberOf, type ProgrammeCreated } from "../contracts";
import { actorOf } from "./read";

export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date, e.g. 2026-11-02");

export const newProgramme = z.object({
  title: z.string().trim().min(1).max(160),
  kind: z.enum(KINDS),
  delivery: z.enum(["internal", "external"]),
  mandatory: z.boolean().default(false),
  detail: z.string().trim().max(80).optional().describe("A short line under the title, e.g. \"Internal, 6 sessions\""),
  startsOn: day,
  endsOn: day.optional(),
}).refine((p) => !p.endsOn || p.endsOn >= p.startsOn, { message: "it can't end before it starts", path: ["endsOn"] });

export const createProgramme = defineService({
  name: "learning.programme.create",
  action: "learning:programme:create",
  resource: "learning.programme",
  input: newProgramme,
  async run(tx, input, ctx) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('learning.programme.number'))`);
    const [{ n }] = await tx.execute(sql`select coalesce(max(number), 0) + 1 as n from learning.programme`);
    const [p] = await tx.execute(sql`insert into learning.programme (tenant_id, number, title, kind, delivery, mandatory, detail, starts_on, ends_on, created_by)
      values (${ctx.tenantId}, ${n}, ${input.title}, ${input.kind}, ${input.delivery}, ${input.mandatory}, ${input.detail ?? null}, ${input.startsOn}, ${input.endsOn ?? null}, ${actorOf(ctx)}) returning id`);
    const number = numberOf(Number(n));
    const payload: ProgrammeCreated = { programmeId: p.id as string, number, title: input.title, kind: input.kind, mandatory: input.mandatory, by: actorOf(ctx) };
    return { result: { id: p.id as string, number }, resourceId: p.id as string, after: input, events: [{ name: EVENTS.programmeCreated, payload }] };
  },
});
