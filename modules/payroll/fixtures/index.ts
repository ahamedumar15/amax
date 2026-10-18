import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { listPeople } from "@amax/hr/contracts";
import { EVENTS, type RunChecked } from "../contracts";
import { buildDraft, groupOf } from "../server/draft";
import { lockRun, recordChanges, stepped, writeDraft } from "../server/runs";
import { COMPONENTS, CURRENT, GROUP, MEMBERS, PAID } from "./data";

const BY = "fixtures";
const AGENT = "job:payroll.variance-agent";

// Seeds the demo pay group, its members and components, September's run as paid, and October's run
// drafted and checked by the engine itself. The agent's suggestions come from the checked event, as
// they would after a real check: the next job tick delivers it. Safe to re-run.
export const payrollFixtures: FixtureSeed = async ({ tx, tenantId, shared }) => {
  const [{ n }] = await tx.execute(sql`select count(*)::int as n from payroll.pay_group`);
  if (Number(n) > 0) return;
  const entity = shared.entities.find((e) => e.key === GROUP.entity)!;
  const [g] = await tx.execute(sql`insert into payroll.pay_group (tenant_id, legal_entity_id, name, currency, pack) values (${tenantId}, ${entity.id}, ${GROUP.name}, ${entity.baseCurrency}, ${GROUP.pack}) returning id`);
  const job = contextFor.job(tenantId, "payroll.fixtures");
  const people = new Map((await listPeople(tx, job, {})).map((p) => [p.employeeNo, p.id]));
  for (const no of MEMBERS) if (people.has(no)) await tx.execute(sql`insert into payroll.pay_group_member (tenant_id, pay_group_id, person_id) values (${tenantId}, ${g.id}, ${people.get(no)!})`);
  for (const c of COMPONENTS.filter((x) => people.has(x.employeeNo))) {
    await tx.execute(sql`insert into payroll.pay_component (tenant_id, pay_group_id, legal_entity_id, person_id, code, label, kind, amount, currency, starts_on, ends_on, basis, recorded_by)
      values (${tenantId}, ${g.id}, ${entity.id}, ${people.get(c.employeeNo)!}, ${c.code}, ${c.label}, ${c.kind}, ${c.amount}, ${entity.baseCurrency}, ${c.from}, ${c.to ?? null}, ${c.basis ?? null}, ${BY})`);
  }
  const group = (await groupOf(tx, g.id as string))!;

  const paid = await buildDraft(tx, job, group, PAID);
  const sep = await writeDraft(tx, tenantId, group, PAID, paid.slips, paid.sources, BY);
  await tx.execute(sql`update payroll.run set status = 'payslips_sent', checked_by = ${AGENT}, checked_at = '2026-10-01T03:00:00Z', hr_approved_by = ${BY}, hr_approved_at = '2026-10-01T05:00:00Z',
    finance_approved_by = ${BY}, finance_approved_at = '2026-10-01T08:00:00Z', bank_file_by = ${BY}, bank_file_at = '2026-10-01T09:00:00Z', sent_by = ${BY}, sent_at = '2026-10-01T10:00:00Z',
    drafted_at = '2026-09-28T03:00:00Z' where id = ${sep}`);
  await tx.execute(sql`insert into payroll.bank_file (tenant_id, run_id, legal_entity_id, rows, total, currency, digest, approved_by)
    select ${tenantId}, ${sep}, ${entity.id}, count(*), sum(net), ${entity.baseCurrency}, 'fixtures', ${BY} from payroll.payslip where run_id = ${sep}`);

  const draft = await buildDraft(tx, job, group, CURRENT);
  const oct = await writeDraft(tx, tenantId, group, CURRENT, draft.slips, draft.sources, BY);
  const run = await lockRun(tx, oct);
  const changes = await recordChanges(tx, job, run, AGENT);
  // The checked event, as checkRun would have written it, so the agent's suggestions follow on the next tick.
  const payload: RunChecked = { ...stepped(run, "checked", AGENT), changes };
  await tx.execute(sql`insert into core.event (tenant_id, name, payload) values (${tenantId}, ${EVENTS.runChecked}, ${JSON.stringify(payload)}::jsonb)`);
};
