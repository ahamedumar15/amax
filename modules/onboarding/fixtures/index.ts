import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { listPeople } from "@amax/hr/contracts";
import { startFor } from "../server/checklists";
import { DONE, LEAVERS_SINCE, TEMPLATES } from "./data";

const BY = "fixtures";

// Seeds the templates, then starts the checklists hr's events would have started for today's joiners
// and recent leavers, with the tasks fixtures.md says are done. Safe to re-run.
export const onboardingFixtures: FixtureSeed = async ({ tx, tenantId, shared }) => {
  const [{ n }] = await tx.execute(sql`select count(*)::int as n from onboarding.template`);
  if (Number(n) > 0) return;
  for (const t of TEMPLATES) {
    const entity = t.entity ? shared.entities.find((e) => e.key === t.entity)!.id : null;
    const [row] = await tx.execute(sql`insert into onboarding.template (tenant_id, kind, title, legal_entity_id, role) values (${tenantId}, ${t.kind}, ${t.title}, ${entity}, ${t.role ?? null}) returning id`);
    for (const [i, [title, owner, due]] of t.tasks.entries()) {
      await tx.execute(sql`insert into onboarding.template_task (tenant_id, template_id, position, title, owner, due_days) values (${tenantId}, ${row.id}, ${i + 1}, ${title}, ${owner}, ${due})`);
    }
  }
  const ctx = contextFor.job(tenantId, "onboarding.fixtures");
  const people = await listPeople(tx, ctx, { status: ["joining", "left"] });
  for (const p of people.filter((x) => x.status === "joining" || (x.leftOn && x.leftOn >= LEAVERS_SINCE)).sort((a, b) => a.employeeNo.localeCompare(b.employeeNo))) {
    const kind = p.status === "joining" ? "joiner" : "leaver";
    const { id } = await startFor(tx, ctx, { personId: p.id, kind });
    const done = DONE[p.employeeNo] ?? 0;
    if (done) await tx.execute(sql`update onboarding.task set done_on = least(due_on, ${shared.today}::date), completed_by = ${BY} where checklist_id = ${id} and position <= ${Number.isFinite(done) ? done : 1000}`);
    if (done === Infinity) await tx.execute(sql`update onboarding.checklist set completed_on = (select max(done_on) from onboarding.task where checklist_id = ${id}) where id = ${id}`);
  }
};
