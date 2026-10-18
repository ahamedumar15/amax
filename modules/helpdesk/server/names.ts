import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { contextFor } from "@amax/core/server";
import { listPeople } from "@amax/hr/contracts";

export const installed = async (tx: Tx, table: string) => Boolean((await tx.execute(sql`select to_regclass(${table}) is not null as on`))[0]?.on);

// 011 (optional): a requester's name is the one hr knows them by, read through its contract; without
// hr, or for someone hr doesn't have, it is the signed-in user's name.
export async function namesOf(tx: Tx, tenantId: string, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const users = await tx.execute(sql`select id, name from auth.user where id = any(${`{${ids.join(",")}}`}::uuid[])`);
  for (const u of users) out.set(u.id as string, u.name as string);
  if (await installed(tx, "hr.person")) {
    for (const p of await listPeople(tx, contextFor.job(tenantId, "helpdesk.names"), {})) if (p.userId && ids.includes(p.userId)) out.set(p.userId, p.name);
  }
  return out;
}

/** "Sahan K.": how the queue names who handles a ticket. */
export const shortName = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest.at(-1)![0]}.` : first;
};
