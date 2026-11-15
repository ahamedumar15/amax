import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";

/** 107: an active account by its name or email, in the caller's tenant transaction; null when there is none. */
export async function activeAccount(tx: Tx, who: string): Promise<{ id: string; name: string; email: string } | null> {
  const [r] = await tx.execute(sql`select id, name, email from auth.user where status = 'active' and (lower(name) = lower(${who.trim()}) or lower(email) = lower(${who.trim()})) order by name limit 1`);
  return r ? { id: r.id as string, name: r.name as string, email: r.email as string } : null;
}
