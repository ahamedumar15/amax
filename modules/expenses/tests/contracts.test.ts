import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import manifest from "../module";
import { EVENTS, listClaimRefs, PAY_VIA, reimbursementsDue, STATUS_LABELS, STATUSES, type ClaimStepped } from "../contracts";
import { expensesDb, T } from "./db";

const LK = "11111111-1111-4111-8111-1111111111a1";

describe("AC-3 contract shape", () => {
  it("publishes statuses, payment routes and every event the manifest emits, each with a declared payload", () => {
    expect(Object.keys(STATUS_LABELS)).toEqual([...STATUSES]);
    expect(PAY_VIA).toEqual(["payroll", "bank"]);
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
    expect(Object.keys(manifest.events?.payloads ?? {})).toEqual(Object.values(EVENTS));
    expect(manifest).toMatchObject({ id: "expenses", group: "Business", dependsOn: ["hr"], integratesWith: ["payroll"] });
  });
});

describe.skipIf(!hasDb)("AC-3 contract reads and payloads (Postgres)", () => {
  let db: Awaited<ReturnType<typeof expensesDb>>;
  beforeAll(async () => { db = await expensesDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("lists claims for the job, the claimant and the manager; reimbursementsDue lists payroll claims; events name no amount", async () => {
    const job = contextFor.job(T, "test");
    expect((await db.tx((tx) => listClaimRefs(tx, job))).map((c) => c.number).sort()).toEqual(["EXP-0101", "EXP-0102", "EXP-0103", "EXP-0104", "EXP-0105", "EXP-0106"]);
    expect((await db.tx(async (tx) => listClaimRefs(tx, await db.as("kasun")))).map((c) => c.number)).toEqual(["EXP-0101"]);
    expect(await db.tx(async (tx) => listClaimRefs(tx, await db.as("maya", "PM")))).toHaveLength(5);
    const due = await db.tx((tx) => reimbursementsDue(tx, job, { legalEntityId: LK, period: "2026-10" }));
    expect(due.map((d) => [d.number, d.amount, d.currency])).toEqual([["EXP-0105", "45000.00", "LKR"]]);
    expect(await db.tx(async (tx) => reimbursementsDue(tx, await db.as("kasun"), { legalEntityId: LK, period: "2026-10" }))).toEqual([]);
    const [k] = await db.q(sql`select id from expenses.category where key = 'travel' and currency = 'LKR'`);
    await db.call("kasun", "claim_expense", { category: k.id, spentOn: "2026-10-15", merchant: "CityHop Taxi (demo)", description: "Taxi to the office", amount: "900" });
    const [e] = await db.q(sql`select payload from core.event where name = ${EVENTS.claimSubmitted}`);
    expect(Object.keys(e.payload as ClaimStepped).sort()).toEqual(["by", "claimId", "legalEntityId", "managerUserId", "number", "status", "userId"]);
  }, 60_000);
});
