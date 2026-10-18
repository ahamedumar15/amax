import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import manifest from "../module";
import { EVENTS, listRunRefs, MIN_COST_CENTRE, runTotals, STEP_LABELS, STEPS, type RunChecked } from "../contracts";
import { payrollDb, T } from "./db";

describe("AC-5 contract shape", () => {
  it("publishes the steps, the cost-centre floor and the events the manifest emits, each with a declared payload and no amount", () => {
    expect(STEPS).toEqual(["draft", "checked", "hr_approved", "finance_approved", "bank_file", "payslips_sent"]);
    expect(Object.keys(STEP_LABELS)).toEqual([...STEPS]);
    expect(MIN_COST_CENTRE).toBe(3);
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
    expect(Object.keys(manifest.events?.payloads ?? {})).toEqual(Object.values(EVENTS));
    expect(Object.values(manifest.events?.payloads ?? {}).flatMap((p) => Object.values(p))).toEqual(expect.arrayContaining(["plain"]));
    expect(Object.values(manifest.events?.payloads ?? {}).flatMap((p) => Object.keys(p))).not.toContain("net");
    expect(manifest).toMatchObject({ id: "payroll", group: "People", dependsOn: ["hr", "leave"], integratesWith: ["time"] });
  });
});

describe.skipIf(!hasDb)("AC-5 contract reads and payloads (Postgres)", () => {
  let db: Awaited<ReturnType<typeof payrollDb>>;
  beforeAll(async () => { db = await payrollDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("lists runs and reads totals by cost centre for the job and Finance, refuses the rest, and the check event carries no pay", async () => {
    const job = contextFor.job(T, "test");
    const refs = await db.tx((tx) => listRunRefs(tx, job));
    expect(refs.map((r) => [r.period, r.status, r.payslips])).toEqual([["2026-10", "checked", 8], ["2026-09", "payslips_sent", 8]]);
    const finance = await db.as("maya", "Finance");
    const totals = await db.tx((tx) => runTotals(tx, finance, refs[0].id));
    expect(totals).toMatchObject({ period: "2026-10", currency: "LKR", gross: expect.stringMatching(/^\d+\.\d\d$/) });
    expect(totals!.costCentres.every((c) => c.people >= MIN_COST_CENTRE)).toBe(true);
    const nimal = await db.as("nimal");
    expect(await db.tx((tx) => listRunRefs(tx, nimal))).toEqual([]);
    const hr = await db.as("maya", "HR");
    await expect(db.tx((tx) => runTotals(tx, hr, refs[0].id))).rejects.toThrow(/payroll:totals/);
    const [e] = await db.q(sql`select payload from core.event where name = ${EVENTS.runChecked}`);
    expect(Object.keys(e.payload as RunChecked).sort()).toEqual(["by", "changes", "legalEntityId", "payGroupId", "period", "runId", "status"]);
  }, 60_000);
});
