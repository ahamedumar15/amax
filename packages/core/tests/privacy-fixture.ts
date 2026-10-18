import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { migratedDatabase } from "@amax/db/testdb";
import { GENESIS } from "../src/chain-key";
import { chainHash } from "../src/audit";
import { configureRuntime, setAuthorizer, type ServiceContext } from "../src/server";
import { setPrivacySources, type PrivacySource } from "../src/privacy";

export const T = "00000000-0000-4000-8000-0000000003a2";
export const LK = "00000000-0000-4000-8000-0000000003e1";
export const AU = "00000000-0000-4000-8000-0000000003e2";
const uid = (n: number) => `00000000-0000-4000-8000-0000000003${String(n).padStart(2, "0")}`;
export const USERS = { hana: uid(11), sam: uid(12), rowan: uid(13), eli: uid(14), ivy: uid(15) };
export const PERSON = { rowan: uid(21), ivy: uid(22) };

const SCHEMA = `create schema pt;
create table pt.person (id uuid primary key, tenant_id uuid not null, user_id uuid, legal_entity_id uuid, name text not null, left_on date, updated_at timestamptz not null default now());
create table pt.payslip (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, person_id uuid not null, amount numeric, pay_year_end date not null);
create table pt.note (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, body text, created_at timestamptz not null);
select core.enable_tenant_rls('pt.person'); select core.enable_tenant_rls('pt.payslip'); select core.enable_tenant_rls('pt.note');
grant usage on schema pt to amax_app; grant select, insert, update, delete on all tables in schema pt to amax_app;`;

export function useTestSources(extra: NonNullable<PrivacySource["retention"]> = []) {
  setPrivacySources(testSources(extra));
}

export const testSources = (extra: NonNullable<PrivacySource["retention"]> = []): PrivacySource[] => [{
    id: "pt",
    subjectIds: async (tx, userId) => (await tx.execute(sql`select id::text from pt.person where user_id = ${userId}`)).map((r) => r.id as string),
    retention: [
      { table: "pt.person", label: "Leavers (fictional)", subject: ["id", "user_id"], entity: "legal_entity_id", fields: ["name"], class: "personal", period: "P1Y", start: { at: ["left_on"] }, action: "anonymise" },
      { table: "pt.payslip", label: "Payslips (fictional)", subject: ["person_id"], fields: ["amount"], class: "pay", period: "P1Y", start: { at: ["pay_year_end"] }, action: "delete" },
      { table: "pt.note", label: "Notes (fictional)", fields: ["body"], class: "personal", period: "P30D", start: { at: ["created_at"] }, action: "delete" },
      ...extra,
    ],
  }];

export const as = (user: keyof typeof USERS, roles: string[]): ServiceContext => ({ tenantId: T, actor: { id: `user:${USERS[user]}`, kind: "user", roles }, source: "chat" });

async function seed(owner: Awaited<ReturnType<typeof migratedDatabase>>["owner"]) {
  await owner.unsafe(SCHEMA);
  await owner`insert into core.tenant (id, name) values (${T}, 'Privacy test (fictional)')`;
  await owner`insert into core.legal_entity (id, tenant_id, name, country, base_currency) values (${LK}, ${T}, 'Lanka (fictional)', 'LK', 'LKR'), (${AU}, ${T}, 'Australia (fictional)', 'AU', 'AUD')`;
  for (const [key, id] of Object.entries(USERS)) await owner`insert into auth.user (id, tenant_id, email, name, legal_entity_id) values (${id}, ${T}, ${`${key}@example.test`}, ${`${key[0].toUpperCase()}${key.slice(1)} Test`}, ${LK})`;
  await owner`insert into pt.person (id, tenant_id, user_id, legal_entity_id, name, left_on) values (${PERSON.rowan}, ${T}, ${USERS.rowan}, ${LK}, 'Rowan Test', now() - interval '3 years'), (${PERSON.ivy}, ${T}, ${USERS.ivy}, ${AU}, 'Ivy Test', now() - interval '3 years')`;
  await owner`insert into pt.payslip (tenant_id, person_id, amount, pay_year_end) values (${T}, ${PERSON.rowan}, 100, now() - interval '8 years'), (${T}, ${PERSON.ivy}, 200, now() - interval '8 years'), (${T}, ${PERSON.rowan}, 300, now() - interval '3 years')`;
  await owner`insert into pt.note (tenant_id, body, created_at) values (${T}, 'old note', now() - interval '60 days'), (${T}, 'new note', now())`;
  const v1 = { tenantId: T, seq: 1, occurredAt: "2026-10-01T00:00:00.000Z", actor: `user:${USERS.rowan}`, onBehalfOf: null, source: "ui", action: "pt.person.update", resource: "pt.person", resourceId: PERSON.rowan, before: null, after: { name: "Rowan Test" } };
  await owner`insert into core.audit_event (tenant_id, seq, occurred_at, chain_v, actor, source, action, resource, resource_id, after, prev_hash, hash)
    values (${T}, 1, ${v1.occurredAt}, 1, ${v1.actor}, 'ui', ${v1.action}, ${v1.resource}, ${v1.resourceId}, ${owner.json(v1.after)}, ${GENESIS}, ${chainHash(GENESIS, v1)})`;
}

export async function privacyDb() {
  const t = await migratedDatabase();
  await seed(t.owner);
  const app = t.app();
  configureRuntime({ db: app, auditKey: "p".repeat(32) });
  setAuthorizer((ctx) => ctx.actor.kind === "system" || !!ctx.actor.roles?.some((r) => r === "Admin" || r === "HR"));
  useTestSources();
  const tx = <R>(fn: Parameters<typeof withTenant<R>>[2]) => withTenant(app, T, fn);
  return { t, app, tx };
}
