import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { moneyOf } from "@amax/core";
import { definePack, packFor, registerPack, type CountryPack, type PayInput } from "../contracts";
import { getRun } from "../server/queries";
import { payrollDb } from "./db";

const seen: PayInput[] = [];
const flat: CountryPack = definePack({
  id: "test-flat", label: "Test pack (fictional)", countries: ["LK"], fictional: true,
  calculate: (p) => { seen.push(p); return p.baseSalary ? [{ code: "basic", label: "Basic", kind: "earning", amount: p.baseSalary }, { code: "levy", label: "Test levy", kind: "deduction", amount: moneyOf("100", p.currency) }] : []; },
  statutory: (run) => [{ code: "levy", label: "Test levy", payee: "Test fund (fictional)", amount: moneyOf(String(run.payslips.length * 100), run.currency), dueOn: `${run.period.month}-28` }],
  filings: (run) => [{ code: "test-return", label: "Test return (fictional)", dueOn: `${run.period.month}-28`, covers: run.payslips.length }],
});

describe.skipIf(!hasDb)("country packs (Postgres)", () => {
  let db: Awaited<ReturnType<typeof payrollDb>>;
  beforeAll(async () => { db = await payrollDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-4 a pack plugs in through calculate, statutory and filings without changing the engine; the draft gives it hr pay, leave and time", async () => {
    expect(() => definePack({ ...flat, id: "Bad Id" })).toThrow(/lower-case/);
    expect(() => definePack({ ...flat, filings: undefined as never })).toThrow(/no filings/);
    registerPack(flat);
    registerPack(flat);
    expect(() => registerPack({ ...flat })).toThrow(/already registered/);
    expect(packFor("test-flat")).toBe(flat);

    await db.t.owner`update payroll.pay_group set pack = 'test-flat'`;
    const payroll = await db.as("maya", "Payroll");
    const [group] = await db.q(sql`select id from payroll.pay_group`);
    const drafted = (await db.registry.call(payroll, "draft_payroll_run", { payGroupId: group.id, period: "2026-11" }, { source: "mcp" })) as { runId: string; sources: Record<string, string> };
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((p) => p.baseSalary && p.period.month === "2026-11" && p.workingDays === 21 && typeof p.unpaidLeaveDays === "number")).toBe(true);
    expect(drafted.sources).toMatchObject({ hr: expect.stringMatching(/HR/), leave: expect.stringMatching(/leave/i), time: expect.any(String) });
    const run = (await getRun(payroll, drafted.runId))!;
    expect(run.pack).toEqual({ id: "test-flat", label: "Test pack (fictional)", fictional: true });
    expect(run.statutory).toEqual([{ label: "Test levy", payee: "Test fund (fictional)", amount: `${seen.length * 100}.00`, dueOn: "2026-11-28" }]);
    expect(run.filings).toEqual([{ label: "Test return (fictional)", dueOn: "2026-11-28" }]);
    expect(run.money!.breakdown.map((b) => b.label)).toEqual(["Net pay", "Test levy"]);
  }, 60_000);
});
