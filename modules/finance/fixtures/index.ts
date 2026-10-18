import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import type { Tx } from "@amax/db";
import { getProjectRef } from "@amax/delivery/contracts";
import { EVENTS, type InvoiceDrafted } from "../contracts";
import { lockContract, writeInvoice } from "../server/issue";
import { addDays } from "../server/read";
import { CONTRACTS, FIRST_NUMBER, INVOICES, MILESTONES, OCTOBER_HOURS, RATES, TARGET, TODAY } from "./data";

const BY = "fixtures";

async function seedContracts(tx: Tx, tenantId: string, entityId: string) {
  const ids = new Map<string, string>();
  for (const c of CONTRACTS) {
    const p = await getProjectRef(tx, c.key);
    if (!p) continue;
    const [row] = await tx.execute(sql`insert into finance.contract (tenant_id, legal_entity_id, project_id, client, kind, currency, value, hourly_rate, monthly_fee, starts_on, renews_on, payment_days, tax_treatment, created_by)
      values (${tenantId}, ${entityId}, ${p.id}, ${p.client}, ${c.kind}, 'USD', ${c.value}, ${c.rate ?? null}, ${c.fee ?? null}, ${c.starts}, ${c.renews ?? null}, ${c.days}, 'export', ${BY}) returning id`);
    ids.set(c.key, row.id as string);
  }
  return ids;
}

async function seedMilestones(tx: Tx, tenantId: string, contractId: string) {
  const ids: string[] = [];
  for (const [i, [label, amount, release]] of MILESTONES.entries()) {
    const [m] = await tx.execute(sql`insert into finance.milestone (tenant_id, contract_id, label, amount, release_version, status, position)
      values (${tenantId}, ${contractId}, ${label}, ${amount}, ${release}, ${INVOICES.some((x) => x.milestone === i) ? "invoiced" : "pending"}, ${i + 1}) returning id`);
    ids.push(m.id as string);
  }
  return ids;
}

export const financeFixtures: FixtureSeed = async ({ tx, tenantId, shared }) => {
  const [{ n }] = await tx.execute(sql`select count(*)::int as n from finance.contract`);
  if (Number(n) > 0) return;
  const entity = shared.entities.find((e) => e.key === "lk")!;
  await tx.execute(sql`insert into finance.settings (tenant_id, today, monthly_target, target_currency) values (${tenantId}, ${TODAY}, ${TARGET}, 'USD') on conflict do nothing`);
  for (const r of RATES) await tx.execute(sql`insert into finance.fx_rate (tenant_id, from_currency, to_currency, rate, as_of, source) values (${tenantId}, ${r.from}, ${r.to}, ${r.rate}, ${r.asOf}, 'Demo rate (fictional)')`);
  const ids = await seedContracts(tx, tenantId, entity.id);
  if (ids.size < CONTRACTS.length) return;
  const milestones = await seedMilestones(tx, tenantId, ids.get("CON")!);
  for (const [i, x] of INVOICES.entries()) {
    const c = await lockContract(tx, ids.get(x.key)!);
    const source = x.key === "CON" ? "milestone" : x.key === "FLT" ? "tm" : "retainer";
    const inv = await writeInvoice(tx, tenantId, c, { source, description: x.what, subtotal: x.amount, hours: x.hours, period: x.period, milestoneId: x.milestone === undefined ? null : milestones[x.milestone], issuedOn: x.on, by: BY, number: `INV-${String(FIRST_NUMBER + i).padStart(4, "0")}` });
    if (x.paidAfter !== null) await tx.execute(sql`insert into finance.payment (tenant_id, invoice_id, amount, currency, received_on, reference, recorded_by) values (${tenantId}, ${inv.id}, ${inv.total}, 'USD', ${addDays(x.on, x.paidAfter)}, ${`Remittance for ${inv.number} (fictional)`}, ${BY})`);
  }
  const flt = ids.get(OCTOBER_HOURS.key)!;
  await tx.execute(sql`insert into finance.billable (tenant_id, contract_id, period, source, hours, amount) values (${tenantId}, ${flt}, ${OCTOBER_HOURS.period}, 'fixtures', ${OCTOBER_HOURS.hours}, ${OCTOBER_HOURS.amount})`);
  const [d] = await tx.execute(sql`insert into finance.draft (tenant_id, contract_id, source, period, description, hours, amount)
    values (${tenantId}, ${flt}, 'tm', ${OCTOBER_HOURS.period}, ${`October hours to date, ${OCTOBER_HOURS.hours} h at $45 (demo)`}, ${OCTOBER_HOURS.hours}, ${OCTOBER_HOURS.amount}) returning id`);
  const payload: InvoiceDrafted = { draftId: d.id as string, contractId: flt, legalEntityId: entity.id, source: "tm" };
  await tx.execute(sql`insert into core.event (tenant_id, name, payload) values (${tenantId}, ${EVENTS.invoiceDrafted}, ${JSON.stringify(payload)}::jsonb)`);
};
