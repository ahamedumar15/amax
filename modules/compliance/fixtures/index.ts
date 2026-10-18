import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import type { Tx } from "@amax/db";
import { contextFor, verifyAuditChain } from "@amax/core/server";
import { listPeople, type PersonRef } from "@amax/hr/contracts";
import { breachRuleFor, notifyBy } from "../packs";
import { levelOf } from "../server/risks";
import { INCIDENTS, PENDING_NAMED, PENDING_V4, POLICIES, RISKS, SUPPLIERS } from "./data";

const userOf = async (tx: Tx, key: string) => {
  const [u] = await tx.execute(sql`select id, name from auth.user where email = ${`${key}@lumenlabs.test`}`);
  return u ? { id: u.id as string, name: u.name as string } : { id: null, name: null };
};

async function seedPolicies(tx: Tx, tenantId: string, people: PersonRef[]) {
  const named = new Set((await Promise.all(PENDING_NAMED.map((k) => userOf(tx, k)))).map((u) => u.id));
  const pending = new Set([...people.filter((p) => named.has(p.userId)), ...people.filter((p) => !p.userId)].slice(0, PENDING_V4).map((p) => p.id));
  for (const p of POLICIES) {
    const [row] = await tx.execute(sql`insert into compliance.policy (tenant_id, key, title, version, summary, published_on, published_by)
      values (${tenantId}, ${p.key}, ${p.title}, ${p.version}, ${p.summary}, ${p.publishedOn}, 'fixtures') on conflict (tenant_id, key, version) do update set title = excluded.title returning id`);
    const who = people.filter((x) => p.everyone || !pending.has(x.id));
    await tx.execute(sql`insert into compliance.acknowledgement (tenant_id, policy_id, person_id, user_id, acknowledged_at)
      select ${tenantId}, ${row.id}, x.person_id::uuid, x.user_id::uuid, ${`${p.publishedOn}T09:00:00Z`}
      from unnest(${`{${who.map((x) => x.id).join(",")}}`}::text[], ${`{${who.map((x) => x.userId ?? "NULL").join(",")}}`}::text[]) as x(person_id, user_id)
      on conflict do nothing`);
  }
}

async function seedRegisters(tx: Tx, tenantId: string) {
  for (const [i, [title, l, imp, owner, treatment, status]] of RISKS.entries()) {
    const u = await userOf(tx, owner);
    await tx.execute(sql`insert into compliance.risk (tenant_id, ref, title, description, likelihood, impact, level, owner_user_id, owner_name, treatment, status, review_on, raised_by, closed_at)
      values (${tenantId}, ${`R-${String(i + 1).padStart(3, "0")}`}, ${title}, 'Fictional demo risk', ${l}, ${imp}, ${levelOf(l, imp)}, ${u.id}, ${u.name}, ${treatment}, ${status ?? "open"},
        '2026-12-15', 'fixtures', ${status === "closed" ? "2026-09-01T00:00:00Z" : null}) on conflict do nothing`);
  }
  for (const [i, x] of INCIDENTS.entries()) {
    const u = await userOf(tx, x.owner);
    const [e] = await tx.execute(sql`select id from core.legal_entity where country = ${x.country} limit 1`);
    const due = x.awareAt ? notifyBy(new Date(x.awareAt), x.country).toISOString() : null;
    await tx.execute(sql`insert into compliance.incident (tenant_id, ref, title, description, occurred_on, legal_entity_id, country, owner_user_id, owner_name, personal_data, data_class, impact,
        breach, aware_at, notify_by, pack_rule, status, resolved_on, reported_by)
      values (${tenantId}, ${`INC-${String(i + 1).padStart(3, "0")}`}, ${x.title}, ${x.description}, ${x.occurredOn}, ${e?.id ?? null}, ${x.country}, ${u.id}, ${u.name}, ${x.personalData}, ${x.dataClass},
        ${x.impact}, ${x.personalData}, ${x.awareAt ?? null}, ${due}, ${x.personalData ? breachRuleFor(x.country).rule : null}, ${x.status}, ${x.resolvedOn}, 'fixtures') on conflict do nothing`);
  }
  for (const s of SUPPLIERS) {
    await tx.execute(sql`insert into compliance.supplier (tenant_id, name, service, data, region, subprocessor, dpa_signed_on, review_on, added_by)
      values (${tenantId}, ${s.name}, ${s.service}, ${s.data}, ${s.region}, ${s.subprocessor}, ${s.dpaSignedOn}, ${s.reviewOn}, 'fixtures') on conflict do nothing`);
  }
}

// Policies and acknowledgements for every active person, the registers, and a real first audit-chain check. Safe to re-run.
export const complianceFixtures: FixtureSeed = async ({ tx, tenantId }) => {
  const people = await listPeople(tx, contextFor.job(tenantId, "compliance.fixtures"), { status: ["active"] });
  await seedPolicies(tx, tenantId, people);
  await seedRegisters(tx, tenantId);
  const chain = await verifyAuditChain(tx, tenantId);
  await tx.execute(chain.ok
    ? sql`insert into compliance.chain_check (tenant_id, ok, events, head_seq, head_hash, source) values (${tenantId}, true, ${chain.length}, ${chain.length || null}, ${chain.head}, 'fixtures')`
    : sql`insert into compliance.chain_check (tenant_id, ok, events, broken_at, reason, source) values (${tenantId}, false, ${chain.brokenAt - 1}, ${chain.brokenAt}, ${chain.reason}, 'fixtures')`);
};
