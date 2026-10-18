import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import type { Tx } from "@amax/db";
import { contextFor } from "@amax/core/server";
import { listPeople } from "@amax/hr/contracts";
import { monthEnd } from "../server/days";
import { HOLIDAYS, OCTOBER, TREND } from "./data";

const insert = (tx: Tx, tenantId: string, userId: string, day: string, hours: number, billable: boolean) =>
  tx.execute(sql`insert into reports.logged_hours (tenant_id, entry_id, user_id, day, hours, billable) values (${tenantId}, gen_random_uuid(), ${userId}, ${day}, ${hours}, ${billable})`);

async function seedTrend(tx: Tx, tenantId: string, users: string[]) {
  const list = sql.join(users.map((u) => sql`${u}::uuid`), sql`, `);
  for (const [month, percent] of TREND) {
    await tx.execute(sql`insert into reports.logged_hours (tenant_id, entry_id, user_id, day, hours, billable)
      select ${tenantId}, gen_random_uuid(), u, d::date, v.hours, v.billable
      from generate_series(${`${month}-01`}::date, ${monthEnd(month)}::date, interval '1 day') d, unnest(array[${list}]) u, (values (${(percent * 8) / 100}::numeric, true), (1::numeric, false)) v(hours, billable)
      where extract(isodow from d) < 6`);
  }
}

// Seeds the demo's "today" (Oct 16), the holidays, and the hours read model for Maya's three billable people. Safe to re-run.
export const reportsFixtures: FixtureSeed = async ({ tx, tenantId, shared }) => {
  await tx.execute(sql`insert into reports.settings (tenant_id, today) values (${tenantId}, ${shared.today}) on conflict (tenant_id) do update set today = excluded.today`);
  for (const e of shared.entities) for (const [on, name] of HOLIDAYS[e.country] ?? [])
    await tx.execute(sql`insert into reports.holiday (tenant_id, legal_entity_id, on_date, name) values (${tenantId}, ${e.id}, ${on}, ${name}) on conflict do nothing`);
  const [{ n }] = await tx.execute(sql`select count(*)::int as n from reports.logged_hours`);
  if (Number(n) > 0) return;
  const people = await listPeople(tx, contextFor.job(tenantId, "reports.fixtures"));
  const userOf = (key: string) => people.find((p) => p.name === shared.people.find((x) => x.key === key)?.name)?.userId ?? null;
  const users = Object.keys(OCTOBER).map(userOf).filter((u): u is string => !!u);
  if (users.length < Object.keys(OCTOBER).length) return;
  await seedTrend(tx, tenantId, users);
  for (const [key, days] of Object.entries(OCTOBER)) for (const [day, billable, other] of days) {
    if (billable > 0) await insert(tx, tenantId, userOf(key)!, day, billable, true);
    if (other > 0) await insert(tx, tenantId, userOf(key)!, day, other, false);
  }
};
