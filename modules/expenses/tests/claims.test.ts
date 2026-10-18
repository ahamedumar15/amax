import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { isMasked } from "@amax/auth";
import type { Expenses } from "../server/view";
import { expensesDb, storage } from "./db";

const PNG = Buffer.from("fake receipt image (demo)").toString("base64");
type Claim = { claimId: string; status: string; overLimit: boolean; payVia?: string };

describe.skipIf(!hasDb)("claims, limits and approvals (Postgres)", () => {
  let db: Awaited<ReturnType<typeof expensesDb>>;
  beforeAll(async () => { db = await expensesDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-1 a receipt on S3 storage, the limit flagged, manager then a different Finance approver, paid by bank; medical detail masked", async () => {
    await expect(db.call("kasun", "claim_expense", { category: "meals", spentOn: "2026-10-15", merchant: "Lotus Leaf Cafe (demo)", description: "Client dinner", amount: "6000" })).rejects.toThrow(/need a receipt/);
    const { receiptId } = await db.call<{ receiptId: string }>("kasun", "add_receipt", { filename: "dinner.png", contentType: "image/png", dataBase64: PNG });
    expect([...storage.objects.keys()].some((k) => k.endsWith(receiptId))).toBe(true);
    const c = await db.call<Claim>("kasun", "claim_expense", { category: "meals", spentOn: "2026-10-15", merchant: "Lotus Leaf Cafe (demo)", description: "Client dinner", amount: "6000", receiptId });
    expect([c.status, c.overLimit]).toEqual(["submitted", true]);
    await expect(db.call("nimal", "approve_expense", { claimId: c.claimId })).rejects.toThrow();
    expect(await db.call("maya", "approve_expense", { claimId: c.claimId })).toMatchObject({ status: "manager_approved", step: "manager" });
    await expect(db.call("maya", "approve_expense", { claimId: c.claimId })).rejects.toThrow();
    expect(await db.call("sahan", "approve_expense", { claimId: c.claimId, payVia: "bank" })).toMatchObject({ status: "approved", step: "finance", payVia: "bank" });
    expect(await db.call("sahan", "record_expense_payment", { claimId: c.claimId, paidOn: "2026-10-17", reference: "Demo transfer 5521" })).toMatchObject({ status: "paid" });
    expect(await db.call("nimal", "get_expense_claim", { claimId: c.claimId })).toBeNull();
    const view = await db.call<Expenses>("maya", "get_expenses", {});
    const medical = view.decide.find((x) => x.category === "medical")!;
    expect([isMasked(medical.merchant), medical.amountText]).toEqual([true, "LKR 4,800"]);
    const own = (await db.call<Expenses>("dinesh", "get_expenses", {})).claims.find((x) => x.category === "medical")!;
    expect(own.merchant).toBe("Harbour Clinic (demo)");
  }, 60_000);
});
