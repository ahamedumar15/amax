import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRegistry } from "@amax/mcp";
import type { Viewer } from "@amax/auth";
import { ctxFor } from "../server/context";
import { createOpportunity, moveOpportunity } from "../server/opportunities";
import { promoteToDelivery, type CreateProject } from "../server/promote";
import { logActivity } from "../server/records";
import { closedWindow, winRateNote } from "../server/stats";
import { acceptSuggestion } from "../server/suggestions";
import { presalesDb } from "./db";

describe("review round 1: the win-rate note names the empty window", () => {
  it.each([[38, 32, "Up 6 points"], [30, 31, "Down 1 point"], [40, 40, "Same as the year before"], [38, null, "No deals closed the year before"], [null, 32, "No deals closed in the last 12 months"], [null, null, "No deals closed in the last 12 months"]] as const)(
    "now %s, before %s → %s", (now, before, note) => expect(winRateNote(now, before)).toBe(note));
});

describe.skipIf(!hasDb)("review round 1 (Postgres)", () => {
  let db: Awaited<ReturnType<typeof presalesDb>>;
  let liam: Viewer, maya: Viewer;
  beforeAll(async () => { db = await presalesDb(); [liam, maya] = [await db.as("liam"), await db.as("maya", "PM")]; });
  afterAll(() => db?.t.drop());

  it.each([["2026-10-16", 0, 8, 3], ["2026-10-16", 1, 25, 8], ["2028-02-29", 1, 2, 1], ["2028-03-01", 0, 0, 0], ["2024-02-29", 0, 0, 0]] as const)(
    "closed window ending %s, %s years back, has %s closed and %s won", async (today, back, closed, won) => {
      expect(await db.tx((tx) => closedWindow(tx, today, back))).toMatchObject({ closed, won });
    });

  it("concurrent creates and an accept each get their own number", async () => {
    const ctx = ctxFor(liam);
    const [s] = await db.q(sql`select id from presales.suggestion where client_name = 'Woodgrove Bank'`);
    const made = await Promise.all([
      ...Array.from({ length: 5 }, (_, i) => createOpportunity(ctx, { client: "Race", title: `Deal ${i}`, value: 1000 })),
      acceptSuggestion(ctx, { id: s.id as string }),
    ]);
    expect(made.map((m) => m.number).sort()).toEqual(["PS-0143", "PS-0144", "PS-0145", "PS-0146", "PS-0147", "PS-0148"]);
  });

  it("two promotes at once create one project; a failed create gives the claim back; closed deals take no new records", async () => {
    await moveOpportunity(ctxFor(liam), { number: "PS-0137", to: "won" });
    const registry = createRegistry(db.modules);
    const create: CreateProject = async (c, p) => (await registry.call(c.viewer as Viewer, "create_project", p, { source: "mcp" })) as { id: string; key: string };
    const results = await Promise.allSettled([promoteToDelivery(maya, { number: "PS-0137", key: "CRA", billing: "retainer" }, { create }), promoteToDelivery(maya, { number: "PS-0137", key: "CRB", billing: "retainer" }, { create })]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await db.q(sql`select key from delivery.project where key in ('CRA', 'CRB')`)).toHaveLength(1);

    await moveOpportunity(ctxFor(liam), { number: "PS-0139", to: "won" });
    const failing: CreateProject = async () => { throw new Error("delivery said no"); };
    await expect(promoteToDelivery(maya, { number: "PS-0139", key: "FAB", billing: "fixed" }, { create: failing })).rejects.toThrow("delivery said no");
    expect(await promoteToDelivery(maya, { number: "PS-0139", key: "FAB", billing: "fixed" }, { create })).toEqual({ number: "PS-0139", projectKey: "FAB" });
    await expect(promoteToDelivery(maya, { number: "PS-0142", key: "CON", billing: "fixed" }, { create })).rejects.toThrow(/isn't won yet/);
    await expect(logActivity(ctxFor(liam), { number: "PS-0139", title: "Late call", kind: "call", on: "2026-10-20" })).rejects.toThrow(/records are closed/);
  });
});
