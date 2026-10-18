import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { EVENTS, type Project, type TechnologyTagged } from "../contracts";
import { careerData } from "./career";
import { by, TAG } from "./read";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** AC-3: confirms the agent's proposed tag, or adds one, on a project in the person's career. Run from chat after its confirm. */
export const tagTechnology = defineService({
  name: "career.technology.tag",
  action: TAG,
  resource: "career.technology",
  input: z.object({ personId: z.string().trim().min(1).max(40), project: z.string().trim().min(1).max(160), technology: z.string().trim().min(1).max(60) }),
  async run(tx, a, ctx) {
    const career = await careerData(tx, ctx, ctx.tenantId, a.personId);
    if (!career) throw new Error(`no person ${a.personId} whose career you can see`);
    const p = career.events.find((e): e is Project => e.kind === "project" && (same(e.project, a.project) || same(e.name, a.project)));
    if (!p) throw new Error(`${career.person.name} has no project "${a.project}" in their career`);
    const who = by(ctx);
    const [confirmed] = await tx.execute(sql`update career.technology set status = 'confirmed', confirmed_by = ${who}, confirmed_at = now()
      where person_id = ${career.person.id} and project = ${p.project} and lower(name) = lower(${a.technology}) and status = 'proposed' returning id, name`);
    const [row] = confirmed ? [confirmed] : await tx.execute(sql`insert into career.technology (tenant_id, person_id, project, name, status, source, proposed_by, confirmed_by, confirmed_at)
      values (${ctx.tenantId}, ${career.person.id}, ${p.project}, ${a.technology}, 'confirmed', 'chat', ${who}, ${who}, now()) on conflict do nothing returning id, name`);
    if (!row) throw new Error(`${a.technology} is already confirmed on ${p.name}`);
    const payload: TechnologyTagged = { personId: career.person.id, project: p.project, technology: row.name as string, added: !confirmed, by: who };
    return { result: { id: row.id as string, project: p.name, technology: row.name as string, added: !confirmed }, resourceId: row.id as string, after: payload, events: [{ name: EVENTS.technologyTagged, payload }] };
  },
});
