import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { EVENTS, type RoleOpened } from "../contracts";
import { mayAct } from "./guard";
import { actorOf } from "./read";

export const RoleInput = z.object({
  title: z.string().min(2).max(120), department: z.string().min(2).max(80),
  legalEntityId: z.uuid().describe("The hiring legal entity's id"), openings: z.number().int().min(1).max(50).default(1),
  skills: z.array(z.string().min(1).max(60)).max(20).default([]).describe("What the screening agent looks for in a CV"),
  reason: z.string().max(300).optional(),
});

// 023 AC-1: a role opened by a person, or by an agent acting for one; who raised it is kept.
export const openRole = defineService({
  scoped: true,
  name: "recruitment.role.open",
  action: "recruitment:role:manage",
  resource: "recruitment.role",
  input: RoleInput,
  async run(tx, input, ctx) {
    mayAct(ctx, "recruitment:role:manage", input.legalEntityId);
    const by = actorOf(ctx);
    const [r] = await tx.execute(sql`insert into recruitment.role (tenant_id, legal_entity_id, title, department, openings, skills, raised_by, reason)
      values (${ctx.tenantId}, ${input.legalEntityId}, ${input.title}, ${input.department}, ${input.openings}, ${`{${input.skills.map((s) => JSON.stringify(s)).join(",")}}`}, ${by}, ${input.reason ?? null}) returning id`);
    const payload: RoleOpened = { roleId: r.id as string, legalEntityId: input.legalEntityId, title: input.title, openings: input.openings, by };
    return { result: { roleId: r.id as string, title: input.title, openings: input.openings }, resourceId: r.id as string, after: { title: input.title, openings: input.openings }, events: [{ name: EVENTS.roleOpened, payload }] };
  },
});
