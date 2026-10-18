import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { contextFor, defineService, type ServiceContext } from "@amax/core/server";
import { SecretNotConfiguredError, SecretsUnavailableError, useSecret, type ConnectorId } from "@amax/core/secrets";
import { EVENTS, type SyncCompleted } from "../contracts";
import { syncSources, type Snapshot } from "../sources";
import { actorOf } from "./read";

/** Opens one 031 credential for the length of `fn`. Tests stand in here; the value never leaves `fn`. */
export type Opener = <T>(ctx: ServiceContext, connector: ConnectorId, purpose: string, fn: (value: string) => Promise<T>) => Promise<T>;
const real: Opener = (ctx, connector, purpose, fn) => useSecret(ctx, { connector, purpose }, (s) => fn(s.reveal()));
let opener: Opener = real;
export const setSecretOpener = (o: Opener | null) => void (opener = o ?? real);
export const openSecret: Opener = (ctx, connector, purpose, fn) => opener(ctx, connector, purpose, fn);

const SnapshotInput = z.object({
  products: z.array(z.object({ externalId: z.string(), seats: z.number().int().min(0) })),
  accounts: z.array(z.object({ externalId: z.string(), lastActiveOn: z.string().nullable(), adminRoles: z.array(z.string()) })),
  devices: z.array(z.object({ externalId: z.string(), name: z.string(), os: z.string(), compliant: z.boolean(), ownerExternalId: z.string().nullable() })),
});

async function applySnapshot(tx: Tx, tenantId: string, s: Snapshot) {
  for (const p of s.products) await tx.execute(sql`update it_access.product set seats = ${p.seats}, synced_at = now() where external_id = ${p.externalId}`);
  for (const a of s.accounts) {
    const [acc] = await tx.execute(sql`update it_access.account set admin_roles = ${`{${a.adminRoles.map((r) => JSON.stringify(r)).join(",")}}`} where external_id = ${a.externalId} returning id`);
    if (acc && a.lastActiveOn) await tx.execute(sql`update it_access.seat s set last_active_on = greatest(s.last_active_on, ${a.lastActiveOn}::date) from it_access.product p
      where p.id = s.product_id and p.source = 'graph' and s.account_id = ${acc.id} and s.removed_on is null`);
  }
  for (const d of s.devices) await tx.execute(sql`insert into it_access.device (tenant_id, account_id, external_id, name, os, compliant, needs_update, synced_at)
    values (${tenantId}, (select id from it_access.account where external_id = ${d.ownerExternalId}), ${d.externalId}, ${d.name}, ${d.os}, ${d.compliant}, ${!d.compliant}, now())
    on conflict (tenant_id, external_id) do update set account_id = excluded.account_id, name = excluded.name, os = excluded.os, compliant = excluded.compliant, needs_update = excluded.needs_update, synced_at = now()`);
}

// The sync's one write per source and run: authorised (only the job holds it-access:sync), audited
// with counts only, and announced, so the licence agent can look at the fresh seats.
export const recordSync = defineService({
  name: "it-access.sync.record", action: "it-access:sync", resource: "it_access.sync_run",
  input: z.object({ source: z.string(), status: z.enum(["ok", "failed", "skipped"]), summary: z.string().max(300), startedAt: z.iso.datetime(), snapshot: SnapshotInput }),
  async run(tx, a, ctx) {
    if (a.status === "ok") await applySnapshot(tx, ctx.tenantId, a.snapshot);
    const by = actorOf(ctx);
    const [r] = await tx.execute(sql`insert into it_access.sync_run (tenant_id, source, status, summary, started_at, started_by) values (${ctx.tenantId}, ${a.source}, ${a.status}, ${a.summary}, ${a.startedAt}, ${by}) returning id`);
    const payload: SyncCompleted = { source: a.source, status: a.status, products: a.snapshot.products.length, devices: a.snapshot.devices.length, by };
    return { result: payload, resourceId: r.id as string, after: { source: a.source, status: a.status }, events: [{ name: EVENTS.syncCompleted, payload }] };
  },
});

const failure = (e: unknown) => (e instanceof Error && e.name !== "Error" ? e.message.replace(/^secrets: /, "") : "couldn't reach the source");
const SKIP = [SecretNotConfiguredError, SecretsUnavailableError];

/** AC-1: one sync for a tenant. Each source opens only its own read credential, outside any transaction. */
export async function runSync(tenantId: string, signal = AbortSignal.timeout(120_000)) {
  const ctx = contextFor.job(tenantId, "it-access.sync");
  const out: SyncCompleted[] = [];
  for (const src of syncSources()) {
    const startedAt = new Date().toISOString();
    let snapshot: Snapshot = { products: [], accounts: [], devices: [] }, status: "ok" | "failed" | "skipped" = "ok", summary: string;
    try {
      snapshot = await openSecret(ctx, src.connector, `${src.label} sync (read-only)`, (value) => src.fetch(value, signal));
      summary = `${snapshot.products.length} products, ${snapshot.accounts.length} accounts, ${snapshot.devices.length} devices`;
    } catch (e) {
      status = SKIP.some((k) => e instanceof k) ? "skipped" : "failed";
      summary = status === "skipped" ? `Skipped: no ${src.connector} credential` : `Failed: ${failure(e)}`;
    }
    out.push(await recordSync(ctx, { source: src.id, status, summary, startedAt, snapshot }));
  }
  return out;
}
