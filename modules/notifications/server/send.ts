import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { loadEnv } from "@amax/core/env";
import { contextFor, getRuntime } from "@amax/core/server";
import { SecretNotConfiguredError } from "@amax/core/secrets";
import { EgressError } from "@amax/api/egress";
import { NonRetryableError } from "@amax/workflows";
import type { Channel } from "../contracts";
import { adapterFor, type Outgoing } from "./adapters";

/** A delivery that can't go out because of amax's setup (no credential): recorded as skipped, never retried. */
export const NOT_SET_UP = "not sent: the channel isn't set up";

const absolute = (href: string | null) => {
  if (!href) return null;
  const base = loadEnv().AMAX_BASE_URL?.replace(/\/$/, "");
  return base ? `${base}${href}` : href;
};

export async function recipient(tx: Tx, userId: string) {
  const [u] = await tx.execute(sql`select id, name, email from auth.user where id = ${userId} and status = 'active'`);
  return u ? { userId, name: u.name as string, email: u.email as string } : null;
}

export const outgoing = (to: Outgoing["to"], n: { title: string; body: string | null; href: string | null; urgent: boolean }): Outgoing =>
  ({ to, subject: n.title, text: n.body ?? n.title, link: absolute(n.href), urgent: n.urgent });

/** Sends through the channel's adapter as the delivery job. Setup and egress refusals don't retry. Returns the adapter id. */
export async function sendVia(tenantId: string, channel: Channel, m: Outgoing, signal: AbortSignal): Promise<string> {
  const adapter = adapterFor(channel);
  await adapter.send(contextFor.job(tenantId, "notifications.deliver"), m, signal).catch((e: unknown) => {
    if (e instanceof SecretNotConfiguredError) throw new NonRetryableError(`${NOT_SET_UP}: ${e.message}`);
    if (e instanceof EgressError) throw new NonRetryableError(e.message);
    throw e;
  });
  return adapter.id;
}

export const inTenant = <T>(tenantId: string, fn: (tx: Tx) => Promise<T>) => withTenant(getRuntime().db, tenantId, fn);
