import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { subjectResolvers } from "./catalog";

export class PrivacyError extends Error {
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = "PrivacyError";
  }
}

export type Subject = { userId: string; label: string; ids: string[]; country: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findUser(tx: Tx, person: string) {
  const ref = person.trim();
  const byId = UUID.test(ref) ? sql`u.id = ${ref}::uuid` : sql`false`;
  const rows = await tx.execute(sql`select u.id::text, u.name, e.country from auth.user u left join core.legal_entity e on e.id = u.legal_entity_id
    where ${byId} or lower(u.email) = lower(${ref}) or lower(u.name) = lower(${ref}) limit 3`);
  if (rows.length > 1) throw new PrivacyError(`"${ref}" names ${rows.length} people; give their email instead`);
  if (!rows.length) throw new PrivacyError(`no person "${ref}" in this organisation`);
  return rows[0];
}

export async function resolveSubject(tx: Tx, person: string): Promise<Subject> {
  const u = await findUser(tx, person);
  const userId = u.id as string;
  const extra = (await Promise.all(subjectResolvers().map((f) => f(tx, userId)))).flat();
  return { userId, label: u.name as string, ids: [...new Set([userId, `user:${userId}`, ...extra])], country: u.country ? String(u.country).trim() : null };
}
