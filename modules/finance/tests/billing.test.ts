import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, tablesMissingRls } from "@amax/db/testdb";
import type { Financials } from "../server/view";
import { financeDb } from "./db";

describe.skipIf(!hasDb)("finance contracts and invoices (Postgres)", () => {
  let db: Awaited<ReturnType<typeof financeDb>>;
  beforeAll(async () => { db = await financeDb(); await db.tick(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-1 contracts are fixed, T&M with a cap and retainer; money carries currency; totals match fixtures.md and convert to each entity's base currency at stored rates", async () => {
    expect((await tablesMissingRls(db.t.owner)).filter((t) => t.startsWith("finance."))).toEqual([]);
    const finance = await db.as("maya", "Finance");
    const f = (await db.registry.call(finance, "get_financials", {}, { source: "mcp" })) as Financials;
    expect([f.currency, f.contractValue, f.invoiced, f.invoicedPct, f.overdue]).toEqual(["USD", "774000.00", "418200.00", 54, "18315.00"]);
    expect(f.overdueNote).toBe("INV-0912, September hours, due Oct 7");
    expect(f.lede).toBe("Contoso's next invoice unlocks when v2.4.0 reaches Prod. Fleet Tracker has one invoice 9 days overdue.");
    expect(f.monthly.map((m) => [m.label, Math.round(Number(m.amount) / 1000), m.partial])).toEqual([["May", 61, false], ["Jun", 74, false], ["Jul", 58, false], ["Aug", 82, false], ["Sep", 77, false], ["Oct", 26, true]]);
    expect([f.ageing.open, ...f.ageing.buckets.map((b) => b.amount)]).toEqual(["96400.00", "78085.00", "18315.00", "0.00", "0.00"]);
    expect(f.contracts.map((c) => [c.projectName, c.kindLabel, c.terms, c.value, c.invoicedPct, c.next, c.payments.text])).toEqual([
      ["Contoso Portal", "Fixed price", "Renews Mar 2027", "420000.00", 55, "$60,000 when v2.4.0 is in Prod", "On time"],
      ["Fleet Tracker", "Time and materials", "$45 an hour, capped", "210000.00", 72, "$14,200 of October hours to date, not yet invoiced", "INV-0912 $18,315 (Sep hours), 9 days overdue"],
      ["HR Insights", "Retainer", "$12,000 a month from Jul 1", "144000.00", 25, "October retainer, $12,000, ready", "Jul–Sep paid"],
    ]);
    expect(f.byEntity).toEqual([expect.objectContaining({ entityName: "Lumen Labs Lanka (Pvt) Ltd", baseCurrency: "LKR", invoiced: "125460000.00" })]);
    const [i] = await db.q(sql`select currency, subtotal, fx_rate, base_currency, base_subtotal from finance.invoice where number = 'INV-0912'`);
    expect([i.currency, Number(i.subtotal), Number(i.fx_rate), i.base_currency, Number(i.base_subtotal)]).toEqual(["USD", 18315, 300, "LKR", 5494500]);
    await expect(db.registry.call(await db.as("nimal"), "get_financials", {}, { source: "mcp" })).rejects.toThrow(/forbidden/);
  }, 60_000);
});
