import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import type { Tx } from "@amax/db";
import { contextFor } from "@amax/core/server";
import { listPeople, type PersonRef } from "@amax/hr/contracts";
import { EVENTS, type ReceiptAdded } from "../contracts";
import { CATEGORIES, CLAIMS, RECEIPT } from "./data";

const BY = "fixtures";

async function seedCategories(tx: Tx, tenantId: string, entities: Map<string, string>) {
  const ids = new Map<string, string>();
  for (const k of CATEGORIES) {
    const [row] = await tx.execute(sql`insert into expenses.category (tenant_id, legal_entity_id, key, name, currency, claim_limit, receipt_over, health)
      values (${tenantId}, ${entities.get(k.entity)}, ${k.key}, ${k.name}, ${k.currency}, ${k.limit}, ${k.receiptOver}, ${Boolean(k.health)}) returning id`);
    ids.set(`${k.entity}:${k.key}`, row.id as string);
  }
  return ids;
}

async function seedReceipt(tx: Tx, tenantId: string, p: PersonRef, filename: string, text: string | null) {
  const [r] = await tx.execute(sql`insert into expenses.receipt (tenant_id, user_id, legal_entity_id, filename, content_type, ocr_text, uploaded_by)
    values (${tenantId}, ${p.userId}, ${p.legalEntityId}, ${filename}, ${filename.endsWith(".pdf") ? "application/pdf" : "image/jpeg"}, ${text}, ${BY}) returning id`);
  return r.id as string;
}

export const expensesFixtures: FixtureSeed = async ({ tx, tenantId, shared }) => {
  const [{ n }] = await tx.execute(sql`select count(*)::int as n from expenses.category`);
  if (Number(n) > 0) return;
  const entities = new Map(shared.entities.map((e) => [e.key, e.id]));
  const people = await listPeople(tx, contextFor.job(tenantId, "expenses.fixtures"));
  const person = (key: string) => people.find((p) => p.name === shared.people.find((x) => x.key === key)?.name);
  const userOf = (key?: string) => (key ? (person(key)?.userId ?? null) : null);
  const categories = await seedCategories(tx, tenantId, entities);
  for (const [i, c] of CLAIMS.entries()) {
    const p = person(c.who);
    if (!p?.userId) continue;
    const entity = shared.entities.find((e) => e.id === p.legalEntityId)!;
    const category = CATEGORIES.find((k) => k.entity === entity.key && k.key === c.category)!;
    const receipt = await seedReceipt(tx, tenantId, p, c.receipt, null);
    await tx.execute(sql`insert into expenses.claim (tenant_id, number, person_id, user_id, person_name, manager_user_id, legal_entity_id, category_id, receipt_id, spent_on, merchant, description,
        amount, currency, over_limit, status, pay_via, payroll_period, submitted_by, manager_decided_by, manager_decided_at, finance_decided_by, finance_decided_at, paid_on, paid_reference, paid_by)
      values (${tenantId}, ${`EXP-${String(101 + i).padStart(4, "0")}`}, ${p.id}, ${p.userId}, ${p.name}, ${p.managerUserId}, ${p.legalEntityId}, ${categories.get(`${entity.key}:${c.category}`)}, ${receipt},
        ${c.on}, ${c.merchant}, ${c.what}, ${c.amount}, ${category.currency}, ${Number(c.amount) > Number(category.limit)}, ${c.status}, ${c.payVia ?? null}, ${c.period ?? null}, ${p.userId},
        ${userOf(c.manager)}, ${c.manager ? `${c.on}T09:00:00Z` : null}, ${userOf(c.finance)}, ${c.finance ? `${c.on}T12:00:00Z` : null}, ${c.paid?.[0] ?? null}, ${c.paid?.[1] ?? null}, ${c.paid ? userOf(c.finance) : null})`);
  }
  const owner = person(RECEIPT.who);
  if (!owner?.userId) return;
  const receiptId = await seedReceipt(tx, tenantId, owner, RECEIPT.filename, RECEIPT.text);
  const payload: ReceiptAdded = { receiptId, userId: owner.userId, legalEntityId: owner.legalEntityId };
  await tx.execute(sql`insert into core.event (tenant_id, name, payload) values (${tenantId}, ${EVENTS.receiptAdded}, ${JSON.stringify(payload)}::jsonb)`);
};
