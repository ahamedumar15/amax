import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { EgressError } from "@amax/api/egress";
import { contextFor, getRuntime, type ServiceContext } from "@amax/core/server";
import { SecretNotConfiguredError, SecretsUnavailableError, useSecret, type ConnectorId } from "@amax/core/secrets";
import { READ_CONNECTORS } from "@amax/it-access/contracts";
import { JOBS } from "../contracts";
import { readGraph, type GraphApp, type Snapshot } from "./graph";
import { recordCollection } from "./record";
import { GraphError } from "./wire";

/** Opens one 031 credential for the length of `fn`. Tests stand in here; the value never leaves `fn`. */
export type Opener = <T>(ctx: ServiceContext, connector: ConnectorId, purpose: string, fn: (value: string) => Promise<T>) => Promise<T>;
const real: Opener = (ctx, connector, purpose, fn) => useSecret(ctx, { connector, purpose }, (s) => fn(s.reveal()));
let opener: Opener = real;
export const setSecretOpener = (o: Opener | null) => void (opener = o ?? real);
export const openSecret: Opener = (ctx, connector, purpose, fn) => opener(ctx, connector, purpose, fn);

/** AC-1: 021's read registration, the one its sync uses for Microsoft Graph. */
export const GRAPH_READ = READ_CONNECTORS.find((c) => c === "msgraph-read")!;
const KNOWN = [GraphError, EgressError, SecretNotConfiguredError, SecretsUnavailableError];
const failure = (e: unknown) => (KNOWN.some((k) => e instanceof k) ? (e as Error).message.replace(/^secrets: /, "") : "couldn't reach Microsoft Graph");

async function plan(tenantId: string) {
  return withTenant(getRuntime().db, tenantId, async (tx) => {
    const [s] = await tx.execute(sql`select sandbox from experience.settings`);
    const on = await tx.execute(sql`select legal_entity_id from experience.collection where enabled and notice_on is not null`);
    return { sandbox: s?.sandbox === true, entities: on.map((r) => r.legal_entity_id as string) };
  });
}

/** One daily collection. With no entity on (no notice recorded), Graph is never called. */
export async function runCollect(tenantId: string) {
  const ctx = contextFor.job(tenantId, JOBS.collect);
  const p = await plan(tenantId);
  if (!p.entities.length) return { ok: true, summary: "Skipped: no legal entity has collection on" };
  let snapshot: Snapshot | null = null;
  if (!p.sandbox) {
    try {
      snapshot = await openSecret(ctx, GRAPH_READ, "read Intune device and app health for digital experience", (value) => readGraph(JSON.parse(value) as GraphApp));
    } catch (e) {
      return { ok: false, summary: `Failed: ${failure(e)}` };
    }
  }
  const r = await recordCollection(ctx, { snapshot, entities: p.entities });
  return { ok: true, summary: `${r.sandbox ? "Sandbox Intune (fictional)" : `${r.devices} devices`} in ${r.entities} entit${r.entities === 1 ? "y" : "ies"}; ${r.issues} issues, ${r.drops} drops` };
}
