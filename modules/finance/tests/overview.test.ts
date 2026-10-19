import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { financeOverview } from "../server/overview";
import { financeDb } from "./db";

describe.skipIf(!hasDb)("finance Overview ticket (Postgres)", () => {
  let db: Awaited<ReturnType<typeof financeDb>>;
  beforeAll(async () => { db = await financeDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("068 AC-1 Ready to invoice sums the open drafts the viewer may see and names the top lines", async () => {
    const part = await financeOverview(await db.as("maya", "Finance"));
    expect(part.tickets).toEqual([expect.objectContaining({ label: "Ready to invoice", value: "$14,200", note: "Fleet Tracker $14,200", pin: expect.objectContaining({ tool: "get_contract" }) })]);
    await expect(financeOverview(await db.as("nimal"))).rejects.toThrow(/forbidden/);
  });
});
