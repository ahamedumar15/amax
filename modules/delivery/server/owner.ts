import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { ServiceContext } from "@amax/core/server";

export type Owner = { id: string; name: string };

const userOf = (id: string | undefined | null) => (id?.startsWith("user:") ? id.slice(5) : null);

/** 081 AC-5: the person behind a write: the user who acted, or the one an agent or credential acted for; null for a bare service. */
export const personOf = (ctx: ServiceContext) => (ctx.actor.kind === "user" ? userOf(ctx.actor.id) : userOf(ctx.onBehalfOf));

async function activePerson(tx: Tx, userId: string): Promise<Owner | null> {
  const [u] = await tx.execute(sql`select id, name from auth.user where id::text = ${userId} and status = 'active'`);
  return u ? { id: u.id as string, name: u.name as string } : null;
}

/** The owner a write names, an active person in the tenant; refused otherwise. */
export async function namedOwner(tx: Tx, userId: string): Promise<Owner> {
  const owner = await activePerson(tx, userId);
  if (!owner) throw Object.assign(new Error("the owner must be an active person in this workspace"), { retryable: false, code: "invalid_input" });
  return owner;
}

/** The owner by default: the named one, else the person acting (none for a bare service). */
export async function ownerFor(tx: Tx, ctx: ServiceContext, userId?: string): Promise<Owner | null> {
  if (userId) return namedOwner(tx, userId);
  const me = personOf(ctx);
  return me ? activePerson(tx, me) : null;
}
