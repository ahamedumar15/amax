import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { FixtureSeed } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { listPeople, type PersonRef } from "@amax/hr/contracts";
import { EVENTS, type SyncCompleted } from "../contracts";
import { CONTRACTOR, DEVICES, NAMED, PRODUCTS, REVIEWED_ON } from "./data";

const BY = "fixtures";
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const bulk = (tx: Tx, table: string, cols: string, rows: Record<string, unknown>[], types: string) =>
  rows.length ? tx.execute(sql`insert into ${sql.raw(`it_access.${table}`)} (${sql.raw(cols)}) select ${sql.raw(cols)} from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as x(${sql.raw(types)})`) : null;

async function seedAccounts(tx: Tx, tenantId: string, people: PersonRef[]) {
  const rows = people.filter((p) => p.status !== "joining").map((p, i) => ({
    tenant_id: tenantId, legal_entity_id: p.legalEntityId, person_id: p.id, user_id: p.userId, display_name: p.name, kind: "employee", external_id: `entra-demo-${p.employeeNo}`,
    admin_roles: NAMED[p.name]?.adminRoles ?? [], entra_groups: p.status === "left" ? 0 : (NAMED[p.name]?.groups ?? 2 + (i % 4)), status: p.status === "left" ? "left" : "active",
    left_on: p.leftOn, reviewed_on: p.status === "left" ? null : REVIEWED_ON, reviewed_by: p.status === "left" ? null : BY,
  }));
  rows.push({ tenant_id: tenantId, legal_entity_id: null, person_id: null, user_id: null, display_name: CONTRACTOR.name, kind: "contractor", external_id: "entra-demo-dataco", admin_roles: [], entra_groups: CONTRACTOR.groups,
    status: "active", left_on: null, reviewed_on: null, reviewed_by: null, expires_on: CONTRACTOR.expiresOn } as never);
  await bulk(tx, "account", "tenant_id, legal_entity_id, person_id, user_id, display_name, kind, external_id, admin_roles, entra_groups, status, left_on, reviewed_on, reviewed_by, expires_on", rows,
    "tenant_id uuid, legal_entity_id uuid, person_id uuid, user_id uuid, display_name text, kind text, external_id text, admin_roles text[], entra_groups int, status text, left_on date, reviewed_on date, reviewed_by text, expires_on date");
  const rank = new Map(people.map((p, i) => [p.id, i]));
  return (await tx.execute(sql`select id, person_id, display_name, status from it_access.account`))
    .map((a) => ({ id: a.id as string, name: a.display_name as string, active: a.status === "active", at: rank.get(a.person_id as string) ?? -1 })).sort((a, b) => a.at - b.at);
}

type Acc = { id: string; name: string };
const productsOf = (name: string) => (name === CONTRACTOR.name ? CONTRACTOR.products : NAMED[name]?.products ?? []);

/** Who holds each product: the named people who have it, then the rest of the active people in turn; the last holders are the idle ones. */
function holdersOf(key: string, i: number, named: Acc[], pool: Acc[], assigned: number) {
  const fixed = named.filter((a) => productsOf(a.name).includes(key));
  const start = (i * 17) % pool.length;
  return [...fixed, ...[...pool.slice(start), ...pool.slice(0, start)].slice(0, assigned - fixed.length)];
}

// Seeds the 12 products, an account for everyone in hr (leavers with everything revoked) and the
// DataCo contractor, their seats with use dates relative to today, and Intune's devices. The licence
// agent's two savings suggestions follow the seeded sync event on the next job tick. Safe to re-run.
export const itAccessFixtures: FixtureSeed = async ({ tx, tenantId }) => {
  const [{ n }] = await tx.execute(sql`select count(*)::int as n from it_access.product`);
  if (Number(n) > 0) return;
  await bulk(tx, "product", "tenant_id, key, name, source, external_id, logo, color, seats, seat_usd, monthly_usd, unused_scope, idle_rule, synced_at",
    PRODUCTS.map((p) => ({ tenant_id: tenantId, key: p.key, name: p.name, source: p.source, external_id: p.externalId, logo: p.logo, color: p.color, seats: p.seats, seat_usd: p.seatUsd, monthly_usd: p.monthlyUsd, unused_scope: p.note ?? null, idle_rule: p.rule ?? "idle", synced_at: new Date().toISOString() })),
    "tenant_id uuid, key text, name text, source text, external_id text, logo text, color text, seats int, seat_usd numeric, monthly_usd numeric, unused_scope text, idle_rule text, synced_at timestamptz");
  const people = await listPeople(tx, contextFor.job(tenantId, "it-access.fixtures"), {});
  const accounts = await seedAccounts(tx, tenantId, people.sort((a, b) => a.employeeNo.localeCompare(b.employeeNo)));
  const names = [...Object.keys(NAMED), CONTRACTOR.name];
  const named = names.map((x) => accounts.find((a) => a.name === x)!).filter(Boolean);
  const pool = accounts.filter((a) => a.active && !names.includes(a.name));
  const productIds = new Map((await tx.execute(sql`select id, key from it_access.product`)).map((p) => [p.key as string, p.id as string]));
  const seats = PRODUCTS.flatMap((p, i) => holdersOf(p.key, i, named, pool, p.assigned).map((a, k, all) => {
    const fromEnd = all.length - k;
    const last = fromEnd <= p.idle ? (p.rule === "never-used" ? null : ago(70 + fromEnd * 9)) : fromEnd <= p.idle + (p.between ?? 0) ? ago(45) : ago(1 + (k % 20));
    return { tenant_id: tenantId, product_id: productIds.get(p.key), account_id: a.id, assigned_on: "2025-01-06", last_active_on: last };
  }));
  await bulk(tx, "seat", "tenant_id, product_id, account_id, assigned_on, last_active_on", seats, "tenant_id uuid, product_id uuid, account_id uuid, assigned_on date, last_active_on date");
  const staff = named.filter((a) => NAMED[a.name]);
  const firsts = [...staff.flatMap((a) => Array<Acc>(NAMED[a.name].devices).fill(a)), ...pool];
  const owners: (Acc | null)[] = [...firsts, ...pool.slice(0, DEVICES.total - DEVICES.unassigned - firsts.length), null];
  const devices = owners.map((a, i) => ({ tenant_id: tenantId, account_id: a?.id ?? null, external_id: `intune-demo-${i + 1}`, name: `LL-LAP-${String(i + 1).padStart(3, "0")}`,
    os: i % 9 === 0 ? "macOS 15" : "Windows 11", compliant: !(i >= 20 && i < 20 + DEVICES.needUpdate), needs_update: i >= 20 && i < 20 + DEVICES.needUpdate, synced_at: new Date().toISOString() }));
  await bulk(tx, "device", "tenant_id, account_id, external_id, name, os, compliant, needs_update, synced_at", devices, "tenant_id uuid, account_id uuid, external_id text, name text, os text, compliant boolean, needs_update boolean, synced_at timestamptz");
  const payload: SyncCompleted = { source: "graph", status: "ok", products: PRODUCTS.length, devices: devices.length, by: BY };
  await tx.execute(sql`insert into it_access.sync_run (tenant_id, source, status, summary, started_at, started_by) values (${tenantId}, 'graph', 'ok', 'Demo data (fictional): 12 products, 231 devices', now(), ${BY})`);
  await tx.execute(sql`insert into core.event (tenant_id, name, payload) values (${tenantId}, ${EVENTS.syncCompleted}, ${JSON.stringify(payload)}::jsonb)`);
};
