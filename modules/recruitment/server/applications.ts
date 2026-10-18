import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { EVENTS, type ApplicationReceived } from "../contracts";
import { mayAct } from "./guard";
import { actorOf, lockApplication } from "./read";

const MANAGE = "recruitment:candidate:manage";
const applicationId = z.uuid().describe("The application's id, from list_recruitment or get_role");
export const CvSection = z.object({ heading: z.string().min(1).max(80), text: z.string().min(1).max(4000) });

// 023 AC-1: a candidate applies for a role. The screening agent reads the CV next (a 006 suggestion).
export const addApplication = defineService({
  scoped: true,
  name: "recruitment.application.add",
  action: MANAGE,
  resource: "recruitment.application",
  sensitive: { name: "candidate", email: "candidate", cv: "candidate" },
  input: z.object({ roleId: z.uuid(), name: z.string().min(2).max(120), email: z.email().optional(), source: z.string().min(2).max(60).describe("e.g. LinkedIn, Referral, Careers page"), cv: z.array(CvSection).max(20).default([]) }),
  async run(tx, input, ctx) {
    const [role] = await tx.execute(sql`select * from recruitment.role where id = ${input.roleId}`);
    if (!role || role.status !== "open") throw new Error("that role isn't open");
    mayAct(ctx, MANAGE, role.legal_entity_id as string);
    const by = actorOf(ctx);
    const [c] = await tx.execute(sql`insert into recruitment.candidate (tenant_id, legal_entity_id, name, email, source, cv)
      values (${ctx.tenantId}, ${role.legal_entity_id}, ${input.name}, ${input.email ?? null}, ${input.source}, ${JSON.stringify(input.cv)}::jsonb) returning id`);
    const [a] = await tx.execute(sql`insert into recruitment.application (tenant_id, legal_entity_id, role_id, candidate_id, moved_by)
      values (${ctx.tenantId}, ${role.legal_entity_id}, ${role.id}, ${c.id}, ${by}) returning id`);
    const payload: ApplicationReceived = { applicationId: a.id as string, roleId: role.id as string, legalEntityId: role.legal_entity_id as string, by };
    return { result: { applicationId: a.id as string, stage: "applied" }, resourceId: a.id as string, after: { roleId: role.id, name: input.name, source: input.source }, events: [{ name: EVENTS.applicationReceived, payload }] };
  },
});

const NEXT: Record<string, string[]> = { applied: ["screening"], screening: ["interview"], interview: [] };
const STAMP: Record<string, string> = { screening: "screened_at", interview: "interviewed_at" };

/** Moves an application one stage on, by a person: screening, then interviews. Offers go through send_offer. */
export const moveApplication = defineService({
  scoped: true,
  name: "recruitment.application.move",
  action: MANAGE,
  resource: "recruitment.application",
  input: z.object({ applicationId, to: z.enum(["screening", "interview"]) }),
  async run(tx, { applicationId, to }, ctx) {
    const a = await lockApplication(tx, applicationId);
    mayAct(ctx, MANAGE, a.legal_entity_id as string);
    if (!NEXT[a.stage as string]?.includes(to)) throw new Error(`can't move an application from ${a.stage} to ${to}`);
    await tx.execute(sql`update recruitment.application set stage = ${to}, ${sql.identifier(STAMP[to])} = coalesce(${sql.identifier(STAMP[to])}, now()), moved_by = ${actorOf(ctx)} where id = ${applicationId}`);
    return { result: { applicationId, stage: to }, resourceId: applicationId, before: { stage: a.stage }, after: { stage: to } };
  },
});

// 023 AC-2: only a person rejects. An agent, a job or a service credential acting alone is refused,
// so a match score can never become a rejection on its own.
export const rejectApplication = defineService({
  scoped: true,
  name: "recruitment.application.reject",
  action: MANAGE,
  resource: "recruitment.application",
  input: z.object({ applicationId, note: z.string().min(2).max(500).describe("Why, in a sentence: kept with the decision") }),
  async run(tx, { applicationId, note }, ctx) {
    if (ctx.actor.kind !== "user") throw new Error("only a person can reject a candidate; an agent's score is a suggestion, never a rejection");
    const a = await lockApplication(tx, applicationId);
    mayAct(ctx, MANAGE, a.legal_entity_id as string);
    if (["hired", "rejected", "withdrawn"].includes(a.stage as string)) throw new Error(`the application is already ${a.stage}`);
    await tx.execute(sql`update recruitment.application set stage = 'rejected', closed_at = now(), close_note = ${note}, moved_by = ${actorOf(ctx)} where id = ${applicationId}`);
    await tx.execute(sql`update recruitment.candidate set decided_at = now() where id = ${a.candidate_id} and not exists (select 1 from recruitment.application x where x.candidate_id = ${a.candidate_id} and x.closed_at is null)`);
    return { result: { applicationId, stage: "rejected" }, resourceId: applicationId, before: { stage: a.stage }, after: { stage: "rejected" } };
  },
});
