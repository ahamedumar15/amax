import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { listRules, setRetentionPeriod, TENANT_DEFAULTS } from "../src/privacy";
import { as, AU, LK, privacyDb } from "./privacy-fixture";

describe.skipIf(!hasDb)("032 AC-2 statutory minimums and tenant periods", () => {
  let db: Awaited<ReturnType<typeof privacyDb>>;
  beforeAll(async () => void (db = await privacyDb()), 60_000);
  afterAll(() => db?.t.drop());

  it("AC-2 a country pack's minimum applies per entity; a tenant can lengthen a period but never go below the minimum; defaults ship", async () => {
    const period = async (entity: string, rule: string) => (await db.tx((tx) => listRules(tx, entity))).rules.find((r) => r.id === rule)!;
    expect(await period(LK, "pt.payslip.amount")).toMatchObject({ period: "P7Y", statutory: { period: "P7Y" }, override: false });
    const hana = as("hana", ["HR"]);
    await expect(setRetentionPeriod(hana, { rule: "pt.payslip.amount", entityId: LK, period: "P5Y" })).rejects.toThrow(/can't be kept for less than P7Y/);
    await expect(setRetentionPeriod(hana, { rule: "Payslips (fictional)", period: "P6Y" })).rejects.toThrow(/less than P7Y/);
    await setRetentionPeriod(hana, { rule: "pt.payslip.amount", entityId: AU, period: "P10Y" });
    expect(await period(AU, "pt.payslip.amount")).toMatchObject({ period: "P10Y", override: true });
    expect((await period(LK, "pt.payslip.amount")).period).toBe("P7Y");
    await setRetentionPeriod(hana, { rule: "pt.person.name", period: "P2Y" });
    expect((await period(LK, "pt.person.name")).period).toBe("P2Y");
    await expect(setRetentionPeriod(as("eli", []), { rule: "pt.person.name", period: "P3Y" })).rejects.toThrow(/forbidden/);
    const [audit] = await db.t.owner`select actor, after from core.audit_event where action = 'privacy.period.set' order by seq limit 1`;
    expect(audit.after).toMatchObject({ rule: "pt.payslip.amount", period: "P10Y" });
    expect(Object.values(TENANT_DEFAULTS).map((d) => [d.label, d.period])).toEqual([["Candidates not hired", "P12M"], ["Inbox agent excerpts", "P30D"], ["amax chat conversations", "P90D"], ["Agent run logs", "P180D"]]);
  }, 60_000);
});
