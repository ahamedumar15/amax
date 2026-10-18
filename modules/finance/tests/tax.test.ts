import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { lumen } from "@amax/testing";
import { financeDb } from "./db";

type Issued = { id: string; number: string; subtotal: string; tax: string; total: string; taxLines: { label: string; amount: string }[]; baseCurrency: string; baseSubtotal: string };

describe.skipIf(!hasDb)("tax and credit notes (Postgres)", () => {
  let db: Awaited<ReturnType<typeof financeDb>>;
  beforeAll(async () => { db = await financeDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-3 tax follows the billing entity (AU GST, SL SSCL then VAT), exports are zero-rated, and a credit note reduces invoiced and open", async () => {
    const finance = await db.as("maya", "Finance");
    const call = <T>(tool: string, args: object) => db.registry.call(finance, tool, args, { source: "mcp" }) as Promise<T>;
    const [lk, au] = [lumen.entities[0].id, lumen.entities[1].id];
    const retainer = (project: string, legalEntityId: string, currency: string) => call<{ contractId: string }>("create_contract", { project, legalEntityId, kind: "retainer", currency, value: "100000", monthlyFee: "10000", startsOn: "2026-10-01" });
    const auC = await retainer("HRI", au, "AUD");
    const au1 = await call<Issued>("invoice_retainer", { contractId: auC.contractId, month: "2026-10" });
    expect([au1.subtotal, au1.taxLines, au1.total, au1.baseCurrency]).toEqual(["10000.00", [expect.objectContaining({ label: "GST 10%", amount: "1000.00" })], "11000.00", "AUD"]);
    const lkC = await retainer("FLT", lk, "LKR");
    const lk1 = await call<Issued>("invoice_retainer", { contractId: lkC.contractId, month: "2026-10" });
    expect(lk1.taxLines.map((t) => [t.label, t.amount])).toEqual([["SSCL 2.5%", "250.00"], ["VAT 18%", "1845.00"]]);
    expect(lk1.total).toBe("12095.00");
    const [exp] = await db.q(sql`select tax, total from finance.invoice where number = 'INV-0912'`);
    expect([Number(exp.tax), Number(exp.total)]).toEqual([0, 18315]);

    const cn = await call<Issued>("issue_credit_note", { invoiceId: lk1.id, amount: "4000", reason: "Two weeks not delivered (fictional)" });
    expect([cn.number, cn.subtotal, cn.tax, cn.total]).toEqual(["CN-0001", "-4000.00", "-838.00", "-4838.00"]);
    const c = await call<{ invoiced: string; invoices: { number: string; open: string }[] }>("get_contract", { contractId: lkC.contractId });
    expect([c.invoiced, c.invoices.find((i) => i.number === lk1.number)!.open]).toEqual(["6000.00", "7257.00"]);
    await expect(call("issue_credit_note", { invoiceId: lk1.id, amount: "6000.01", reason: "too much" })).rejects.toThrow(/only 6000.00 LKR left/);
    await expect(call("invoice_retainer", { contractId: lkC.contractId, month: "2026-10" })).rejects.toThrow(/already invoiced/);
  }, 60_000);
});
