import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import manifest from "../module";
import { EVENTS, getOpportunityRef, listOpportunityRefs, numberOf, OPEN_STAGES, pipelineTotals, STAGES, type OpportunityStageChanged } from "../contracts";
import { ctxFor } from "../server/context";
import { moveOpportunity } from "../server/opportunities";
import { presalesDb } from "./db";

describe("AC-4 contract shape", () => {
  it("publishes stages, numbers and the events the manifest emits", () => {
    expect(STAGES).toEqual(["new-idea", "lead", "qualified", "proposal", "negotiation", "won", "lost"]);
    expect(OPEN_STAGES).toEqual(["new-idea", "lead", "qualified", "proposal", "negotiation"]);
    expect(numberOf(142)).toBe("PS-0142");
    expect(EVENTS).toEqual({ stageChanged: "presales.opportunity.stage_changed", promoted: "presales.opportunity.promoted" });
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
  });
});

describe.skipIf(!hasDb)("AC-4 contract reads and event payloads (Postgres)", () => {
  let db: Awaited<ReturnType<typeof presalesDb>>;
  beforeAll(async () => { db = await presalesDb(); });
  afterAll(() => db?.t.drop());

  it("reads opportunities and the open pipeline in USD, and a move emits the published payload", async () => {
    const open = await db.tx((tx) => listOpportunityRefs(tx, { open: true }));
    expect(open.map((o) => [o.client, o.valueUsd.amount, o.stage, o.winChance, o.health])).toEqual([
      ["Northwind Insurance", "180000.0000", "proposal", 60, "amber"], ["Fabrikam", "320000.0000", "qualified", 30, "amber"], ["Contoso", "96000.0000", "negotiation", 80, "green"],
    ]);
    expect((await db.tx((tx) => listOpportunityRefs(tx))).length).toBeGreaterThan(open.length);
    const hr = await db.tx((tx) => getOpportunityRef(tx, "PS-0133"));
    expect(hr).toMatchObject({ client: "Northwind HR", stage: "won", projectKey: "HRI" });
    expect(await db.tx((tx) => getOpportunityRef(tx, hr!.id))).toEqual(hr);
    expect(await db.tx((tx) => getOpportunityRef(tx, "PS-9999"))).toBeNull();
    expect(await db.tx((tx) => pipelineTotals(tx))).toEqual({ open: { amount: "596000.0000", currency: "USD" }, weighted: { amount: "280800.0000", currency: "USD" }, count: 3 });

    await moveOpportunity(ctxFor(await db.as("liam")), { number: "PS-0137", to: "won" });
    const [e] = await db.q(sqlEvent(EVENTS.stageChanged));
    expect(e.payload as OpportunityStageChanged).toMatchObject({ number: "PS-0137", from: "negotiation", to: "won", fromChance: 80, toChance: 100, reason: null });
  });
});

const sqlEvent = (name: string) => sql`select payload from core.event where name = ${name} order by created_at desc limit 1`;
