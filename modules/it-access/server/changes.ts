import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Emitted } from "@amax/core/server";
import { EVENTS, type ChangeQueued } from "../contracts";
import type { ChangeDetail } from "./apply";

export type Action = "grant" | "revoke" | "remove-seat" | "restore";
export type Detail = ChangeDetail & { seatIds: string[]; entraGroups?: number; adminRoles?: string[] };
type Target = { accountId: string | null; productId: string | null };

/** What the write step needs for an account: its Entra id, and the Graph licences among `seatIds` (or `productId`). */
export async function detailFor(tx: Tx, t: Target, seatIds: string[]): Promise<Detail> {
  const [a] = t.accountId ? await tx.execute(sql`select external_id, entra_groups, admin_roles from it_access.account where id = ${t.accountId}`) : [];
  const products = await tx.execute(seatIds.length
    ? sql`select distinct p.name, p.source, p.external_id from it_access.seat s join it_access.product p on p.id = s.product_id where s.id = any(${`{${seatIds.join(",")}}`}::uuid[])`
    : sql`select name, source, external_id from it_access.product where id = ${t.productId}`);
  const graph = products.filter((p) => p.source === "graph" && p.external_id);
  return {
    externalUserId: (a?.external_id as string | null) ?? null, skuIds: graph.map((p) => p.external_id as string), products: products.map((p) => p.name as string),
    graph: products.length > 0 ? graph.length === products.length : Boolean(a?.external_id), seatIds,
    entraGroups: a ? Number(a.entra_groups) : undefined, adminRoles: a ? ((a.admin_roles as string[]) ?? []) : undefined,
  };
}

/** Queues one approved change for the apply workflow and returns its id and event. */
export async function queueChange(tx: Tx, tenantId: string, t: Target & { action: Action; effectiveOn: string; by: string; detail: Detail }): Promise<{ id: string; event: Emitted }> {
  const [c] = await tx.execute(sql`insert into it_access.change (tenant_id, account_id, product_id, action, detail, effective_on, approved_by)
    values (${tenantId}, ${t.accountId}, ${t.productId}, ${t.action}, ${JSON.stringify(t.detail)}::jsonb, ${t.effectiveOn}, ${t.by}) returning id`);
  const payload: ChangeQueued = { changeId: c.id as string, action: t.action, accountId: t.accountId, productId: t.productId, effectiveOn: t.effectiveOn, by: t.by };
  return { id: c.id as string, event: { name: EVENTS.changeQueued, payload } };
}

const INVERSE: Record<Action, Action> = { grant: "remove-seat", "remove-seat": "restore", revoke: "restore", restore: "revoke" };

/** 006 undo: a change not yet made (queued, or waiting for IT by hand) is cancelled; one already made gets its inverse queued for today. */
export async function undoChanges(tx: Tx, tenantId: string, ids: string[], by: string, on: string) {
  const events: Emitted[] = [];
  for (const id of ids) {
    const [c] = await tx.execute(sql`select * from it_access.change where id = ${id} for update`);
    if (!c || c.status === "cancelled" || c.status === "failed") continue;
    if (c.status === "queued" || c.status === "manual") {
      await tx.execute(sql`update it_access.change set status = 'cancelled', outcome = ${`Undone by ${by} before it was made`} where id = ${id}`);
      continue;
    }
    const q = await queueChange(tx, tenantId, { accountId: c.account_id as string | null, productId: c.product_id as string | null, action: INVERSE[c.action as Action], effectiveOn: on, by, detail: c.detail as Detail });
    events.push(q.event);
  }
  return events;
}

/** The change's effect on this module's records, made with it on its day (applied, or left to IT by hand). */
export async function effect(tx: Tx, c: { action: Action; account_id: string | null; product_id: string | null; detail: Detail }, by: string, on: string) {
  const ids = `{${c.detail.seatIds.join(",")}}`;
  if (c.action === "grant" && c.account_id && c.product_id) {
    const [s] = await tx.execute(sql`insert into it_access.seat (tenant_id, product_id, account_id, assigned_on, last_active_on) select tenant_id, ${c.product_id}, id, ${on}, ${on} from it_access.account where id = ${c.account_id} returning id`);
    return { ...c.detail, seatIds: [s.id as string] };
  }
  if (c.action === "restore") {
    await tx.execute(sql`update it_access.seat set removed_on = null, removed_by = null where id = any(${ids}::uuid[])`);
    if (c.account_id && c.detail.entraGroups !== undefined) await tx.execute(sql`update it_access.account set entra_groups = ${c.detail.entraGroups}, admin_roles = ${`{${(c.detail.adminRoles ?? []).map((r) => JSON.stringify(r)).join(",")}}`} where id = ${c.account_id}`);
    return c.detail;
  }
  await tx.execute(sql`update it_access.seat set removed_on = ${on}, removed_by = ${by} where id = any(${ids}::uuid[]) and removed_on is null`);
  if (c.action === "revoke" && c.account_id) await tx.execute(sql`update it_access.account set entra_groups = 0, admin_roles = '{}' where id = ${c.account_id}`);
  return c.detail;
}
