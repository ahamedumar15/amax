import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { assertCan, viewerOf, type Viewer } from "@amax/auth";
import { defineService } from "@amax/core/server";
import { amount } from "./claims";
import { amt, money, read, type Row } from "./read";

export type CategoryView = { id: string; key: string; name: string; legalEntityId: string; entity: string; currency: string; claimLimit: string; receiptOver: string; limitText: string; receiptText: string; health: boolean };

const CATEGORIES = sql`select k.*, e.name as entity from expenses.category k join core.legal_entity e on e.id = k.legal_entity_id`;

const toView = (k: Row): CategoryView => ({
  id: k.id as string, key: k.key as string, name: k.name as string, legalEntityId: k.legal_entity_id as string, entity: k.entity as string, currency: String(k.currency),
  claimLimit: amt(k.claim_limit), receiptOver: amt(k.receipt_over), limitText: money(k.claim_limit, String(k.currency)),
  receiptText: Number(k.receipt_over) > 0 ? `Over ${money(k.receipt_over, String(k.currency))}` : "Always", health: Boolean(k.health),
});

export async function categoriesIn(tx: Tx, entities?: string[]): Promise<CategoryView[]> {
  const rows = await tx.execute(sql`${CATEGORIES} order by e.name, k.name`);
  return rows.filter((k) => !entities || entities.includes(k.legal_entity_id as string)).map(toView);
}

export const listCategories = (v: Viewer) => read(v, (tx) => categoriesIn(tx));

export const getCategory = (v: Viewer, id: string) =>
  read(v, async (tx) => {
    const [k] = await tx.execute(sql`${CATEGORIES} where k.id = ${id}`);
    return k ? toView(k) : null;
  });

export const setCategoryLimits = defineService({
  scoped: true, name: "expenses.category.limits", action: "expenses:policy", resource: "expenses.category",
  input: z.object({ categoryId: z.uuid(), claimLimit: amount.describe("The most one claim may be before it's flagged"), receiptOver: amount.describe("Claims over this need a receipt; 0 for always") }),
  async run(tx, a, ctx) {
    const [k] = await tx.execute(sql`select * from expenses.category where id = ${a.categoryId} for update`);
    if (!k) throw Object.assign(new Error("no such category"), { code: "not_found" });
    const v = viewerOf(ctx);
    if (v) assertCan(v, "expenses:policy", { legalEntityId: k.legal_entity_id as string });
    await tx.execute(sql`update expenses.category set claim_limit = ${a.claimLimit}, receipt_over = ${a.receiptOver} where id = ${a.categoryId}`);
    return { result: { categoryId: a.categoryId, name: k.name as string, claimLimit: a.claimLimit, receiptOver: a.receiptOver }, resourceId: a.categoryId,
      before: { claimLimit: amt(k.claim_limit), receiptOver: amt(k.receipt_over) }, after: { claimLimit: a.claimLimit, receiptOver: a.receiptOver } };
  },
});
