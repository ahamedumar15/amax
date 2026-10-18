import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { acceptSuggestion, undoSuggestion } from "@amax/agents/server";
import manifest from "../module";
import { ctxFor } from "../server/read";
import { expensesDb } from "./db";

const open = (db: Awaited<ReturnType<typeof expensesDb>>) => db.q(sql`select id, proposed, agent_name, scope from agents.suggestion where kind = 'expenses.receipt-claim' and status = 'open' order by created_at`);
const TEXT = "Bayside Fuel (demo)\n2026-10-16\nPetrol 12.4 L\nTOTAL LKR 4,650.00";

describe.skipIf(!hasDb)("receipt agent (Postgres)", () => {
  let db: Awaited<ReturnType<typeof expensesDb>>;
  beforeAll(async () => { db = await expensesDb(); await db.tick(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-2 the claim intent exists; a receipt's fields become a suggestion only its owner accepts, which files the claim, and undo withdraws it", async () => {
    expect(manifest.chatIntents).toEqual([expect.objectContaining({ id: "expenses.claim", tool: "claim_expense" })]);
    const [fixture] = await open(db);
    expect([fixture.agent_name, fixture.proposed]).toEqual(["Receipt agent", expect.objectContaining({ merchant: "Brewline Coffee (demo)", spentOn: "2026-10-15", amount: "1380", currency: "LKR", category: "meals" })]);
    await expect(acceptSuggestion(ctxFor(await db.as("maya")), { id: fixture.id as string })).rejects.toThrow();
    expect(await acceptSuggestion(ctxFor(await db.as("nimal")), { id: fixture.id as string })).toMatchObject({ status: "accepted" });
    const [claim] = await db.q(sql`select c.status, c.amount::numeric as amount, c.receipt_id is not null as has_receipt from expenses.claim c where c.merchant = 'Brewline Coffee (demo)'`);
    expect([claim.status, Number(claim.amount), claim.has_receipt]).toEqual(["submitted", 1380, true]);
    expect(await undoSuggestion(ctxFor(await db.as("nimal")), { id: fixture.id as string })).toMatchObject({ status: "undone" });
    const [gone] = await db.q(sql`select status from expenses.claim where merchant = 'Brewline Coffee (demo)'`);
    expect(gone.status).toBe("withdrawn");

    await db.call("kasun", "add_receipt", { filename: "fuel.jpg", contentType: "image/jpeg", dataBase64: Buffer.from("demo").toString("base64"), text: TEXT });
    await db.tick();
    const fuel = (await open(db)).find((s) => (s.proposed as { merchant: string }).merchant === "Bayside Fuel (demo)");
    expect(fuel?.proposed).toMatchObject({ amount: "4650", category: "travel", spentOn: "2026-10-16" });
  }, 60_000);
});
