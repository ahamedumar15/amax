import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { day } from "./read";

/** A change IT must make by hand (`manual`): the screen leads with these until someone confirms one. */
export type WaitingRow = { changeId: string; action: string; account: string | null; product: string | null; effectiveOn: string; leaver: boolean; outcome: string | null; approvedBy: string };

export async function waitingRows(tx: Tx, changeId?: string): Promise<WaitingRow[]> {
  const rows = await tx.execute(sql`select c.id, c.action, c.effective_on, c.outcome, c.approved_by, a.display_name, a.status as account_status, p.name as product
    from it_access.change c left join it_access.account a on a.id = c.account_id left join it_access.product p on p.id = c.product_id
    where ${changeId ? sql`c.id = ${changeId}` : sql`c.status = 'manual'`} order by (c.action = 'revoke') desc, c.effective_on, c.approved_at`);
  return rows.map((r) => ({
    changeId: r.id as string, action: r.action as string, account: (r.display_name as string | null) ?? null, product: (r.product as string | null) ?? null,
    effectiveOn: day(r.effective_on)!, leaver: r.action === "revoke", outcome: (r.outcome as string | null) ?? null, approvedBy: r.approved_by as string,
  }));
}
