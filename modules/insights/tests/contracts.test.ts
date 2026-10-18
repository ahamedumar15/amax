import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import manifest from "../module";
import { currentInsights, EVENTS, JOBS, KINDS } from "../contracts";
import { sharedDb } from "./db";

describe("AC-4 contract shape", () => {
  it("publishes every event the manifest emits, each with a declared payload, and the jobs it schedules", () => {
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
    expect(Object.keys(manifest.events?.payloads ?? {})).toEqual(Object.values(EVENTS));
    expect((manifest.schedules as { name: string }[]).map((s) => s.name)).toEqual(Object.values(JOBS));
    expect(KINDS).toEqual(["briefing", "risk", "opportunity", "trend", "market", "talent"]);
  });
});

describe.skipIf(!hasDb)("AC-4 contract reads and payloads (Postgres)", () => {
  const use = sharedDb();

  it("currentInsights reads as the viewer, each with its sources; events carry ids and counts, never the text", async () => {
    const db = use();
    const trends = await db.tx(async (tx) => currentInsights(tx, await db.as("maya"), { kind: "trend", horizon: "12m" }));
    expect(trends.map((t) => [t.title, t.sources.length])).toContainEqual(["Low-code app factories", 1]);
    await expect(db.tx(async (tx) => currentInsights(tx, await db.as("nimal")))).rejects.toThrow(/forbidden/);
    const { insightId } = await db.call<{ insightId: string }>("maya", "record_insight", { kind: "market", title: "Contract check", body: "", confidence: "low", asOf: "2026-10-16", sources: [{ label: "x", evidenceRef: "/presales" }] });
    await db.call("maya", "dismiss_insight", { insightId });
    const events = await db.q(sql`select name, payload from core.event where name like 'insights.%' order by created_at`);
    expect(events.map((e) => [e.name, Object.keys(e.payload as object).sort()])).toEqual([[EVENTS.recorded, ["by", "insightId", "kind", "sources"]], [EVENTS.dismissed, ["by", "insightId", "kind"]]]);
  }, 60_000);
});
