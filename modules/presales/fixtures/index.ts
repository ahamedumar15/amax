import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import type { Tx } from "@amax/db";
import { getProjectRef } from "@amax/delivery/contracts";
import { HISTORY, OPEN, RATES, RECENT, SNAPSHOTS, SUGGESTIONS, type Opp } from "./data";

const userId = async (tx: Tx, name: string) =>
  ((await tx.execute(sql`select id from auth.user where name = ${name} limit 1`))[0]?.id as string | undefined) ?? null;

async function seedOpportunity(tx: Tx, tenantId: string, o: Opp) {
  const [client] = await tx.execute(sql`insert into presales.client (tenant_id, name, country) values (${tenantId}, ${o.client}, ${o.country ?? null})
    on conflict (tenant_id, name) do update set name = excluded.name returning id`);
  const currency = o.currency ?? "USD";
  const [rate] = currency === "USD" ? [{ r: "1" }] : await tx.execute(sql`select usd_rate::text as r from presales.fx_rate where currency = ${currency}`);
  const first = o.steps[0];
  const last = o.steps.at(-1)!;
  const closed = last[0] === "won" || last[0] === "lost" ? last[1] : null;
  const project = o.project ? await getProjectRef(tx, o.project) : null;
  const [row] = await tx.execute(sql`insert into presales.opportunity (tenant_id, number, client_id, title, stage, win_chance, value_amount, value_currency, usd_rate, value_usd,
      owner_user_id, owner_name, lead_name, service, cost_centre, estimate_days, expected_close, lead_source, competing, next_step, lost_reason, lost_competitor,
      closed_at, stage_since, project_id, project_key, created_at, updated_at)
    values (${tenantId}, ${o.number}, ${client.id}, ${o.title}, ${last[0]}, ${last[2]}, ${o.value}, ${currency}, ${rate.r}, round(${o.value}::numeric * ${rate.r}::numeric, 4),
      ${await userId(tx, o.owner)}, ${o.owner}, ${o.lead ?? null}, ${o.service ?? null}, ${o.costCentre ?? null}, ${o.estimateDays ?? null}, ${o.expectedClose ?? null},
      ${o.leadSource ?? null}, ${o.competing ?? null}, ${o.nextStep ?? null}, ${o.lost?.[0] ?? null}, ${o.lost?.[1] ?? null},
      ${closed}, ${o.steps.filter((s) => s[0] === last[0])[0][1]}, ${project?.id ?? null}, ${project?.key ?? null}, ${first[1]}, ${last[1]})
    on conflict (tenant_id, number) do nothing returning id`);
  if (!row) return;
  for (const [i, [stage, at, chance, by, note]] of o.steps.entries()) {
    const prev = o.steps[i - 1];
    await tx.execute(sql`insert into presales.stage_change (tenant_id, opportunity_id, from_stage, to_stage, from_chance, to_chance, note, by_name, by_actor, at)
      values (${tenantId}, ${row.id}, ${prev?.[0] ?? null}, ${stage}, ${prev?.[2] ?? null}, ${chance}, ${note ?? null}, ${by}, 'fixtures', ${at})`);
  }
  for (const [title, kind, owner, on, progress, note] of o.activities ?? []) {
    await tx.execute(sql`insert into presales.activity (tenant_id, opportunity_id, title, note, kind, owner_name, on_date, progress) values (${tenantId}, ${row.id}, ${title}, ${note ?? null}, ${kind}, ${owner}, ${on}, ${progress})`);
  }
  for (const [title, owner, due, status] of o.tasks ?? []) {
    await tx.execute(sql`insert into presales.task (tenant_id, opportunity_id, title, owner_name, due, status) values (${tenantId}, ${row.id}, ${title}, ${owner}, ${due}, ${status})`);
  }
  for (const [kind, title, impact, owner, status, decided] of o.risks ?? []) {
    await tx.execute(sql`insert into presales.risk (tenant_id, opportunity_id, kind, title, impact, owner_name, status, decided_on) values (${tenantId}, ${row.id}, ${kind}, ${title}, ${impact}, ${owner}, ${status}, ${decided ?? null})`);
  }
}

export const presalesFixtures: FixtureSeed = async ({ tx, tenantId }) => {
  for (const [currency, rate] of RATES) await tx.execute(sql`insert into presales.fx_rate (tenant_id, currency, usd_rate, as_of) values (${tenantId}, ${currency}, ${rate}, '2026-10-01') on conflict do nothing`);
  for (const o of [...HISTORY, ...RECENT, ...OPEN]) await seedOpportunity(tx, tenantId, o);
  for (const [month, total, weighted] of SNAPSHOTS) {
    await tx.execute(sql`insert into presales.pipeline_snapshot (tenant_id, month, total_usd, weighted_usd, taken_at) values (${tenantId}, ${month}, ${total}, ${weighted}, (${month}::date + interval '1 month')) on conflict do nothing`);
  }
  const seeded = await tx.execute(sql`select count(*)::int as n from presales.suggestion`);
  if (Number(seeded[0].n) > 0) return;
  for (const s of SUGGESTIONS) {
    await tx.execute(sql`insert into presales.suggestion (tenant_id, client_name, title, summary, value_amount, value_currency, owner_name, source, source_label, found_at)
      values (${tenantId}, ${s.client}, ${s.title}, ${s.summary}, ${s.value}, ${s.currency}, ${s.owner}, ${s.source}, ${s.label}, ${s.at})`);
  }
};
