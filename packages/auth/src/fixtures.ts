import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import { isRole } from "./roles";

export const demoEmail = (key: string) => `${key}@lumenlabs.test`;

// Demo users for the shared Lumen Labs people, with the roles fixtures.md gives them, so the demo
// sign-in can act as Maya, Nimal or Sahan. Leavers are seeded deactivated.
export const authFixtures: FixtureSeed = async ({ tx, tenantId, shared }) => {
  for (const p of shared.people) {
    if (p.status === "joining") continue;
    const entity = shared.entities.find((e) => e.key === p.entity);
    const [u] = await tx.execute(sql`insert into auth.user (tenant_id, external_id, email, name, legal_entity_id, status)
      values (${tenantId}, ${`demo:${p.key}`}, ${demoEmail(p.key)}, ${p.name}, ${entity?.id ?? null}, ${p.status === "left" ? "deactivated" : "active"})
      on conflict (tenant_id, external_id) do update set name = excluded.name returning id`);
    for (const role of p.roles.filter(isRole)) {
      await tx.execute(sql`insert into auth.role_assignment (tenant_id, user_id, role, source) values (${tenantId}, ${u.id}, ${role}, 'manual') on conflict do nothing`);
    }
  }
};
