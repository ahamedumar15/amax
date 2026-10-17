import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { listPeople } from "@amax/hr/contracts";

/** Projects a user is allocated to this month: feeds the viewer's @assigned scope (delivery, time). */
export async function assignedProjectIds(tx: Tx, userId: string): Promise<string[]> {
  const me = (await listPeople(tx, { status: ["active"] })).find((p) => p.userId === userId);
  if (!me) return [];
  return (await tx.execute(sql`select distinct project_id from allocations.allocation where person_id = ${me.id} and project_id is not null and month = date_trunc('month', current_date)::date`)).map((r) => r.project_id as string);
}
