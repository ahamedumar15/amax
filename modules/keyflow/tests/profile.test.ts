import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import { createRegistry } from "@amax/mcp";
import { keyflowProfile, lastSync } from "../contracts";
import { personProfile } from "../server/profile";
import { keyflowDb, T } from "./db";

const masked = { masked: true, class: "performance" };

describe.skipIf(!hasDb)("a person's Keyflow profile and its review scores (Postgres)", () => {
  let db: Awaited<ReturnType<typeof keyflowDb>>;
  beforeAll(async () => { db = await keyflowDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC1 goals and recognition show on the person page; review scores (performance) only to HR, Leadership, the person and their manager; the contract reads fail closed", async () => {
    const kasun = await db.personId("LL-0417");
    const scores = async (key: string, role?: "HR" | "PM" | "Leadership") => (await personProfile(await db.as(key, role), "LL-0417"))?.reviews;
    const mine = await personProfile(await db.as("kasun"), "LL-0417");
    expect(mine?.goals.map((g) => [g.title, g.status, g.progress])).toEqual([
      ["Pass the AWS Solutions Architect exam", "at-risk", 20], ["Cut Fleet Tracker p95 latency to 300 ms", "on-track", 70], ["Mentor two associate engineers", "on-track", 50]]);
    expect(mine?.recognition.map((k) => k.fromName)).toEqual(["Maya Fernando", "Nimal Silva"]);
    expect(mine?.reviews).toEqual([expect.objectContaining({ cycle: "2026 H1 review", score: 4.2, scale: 5 }), expect.objectContaining({ cycle: "2025 H2 review", score: 3.8 })]);
    expect((await scores("maya", "PM")) as unknown[]).toHaveLength(2);
    expect(await scores("sahan", "HR")).toHaveLength(2);
    expect(await scores("sahan", "Leadership")).toHaveLength(2);
    expect(await scores("sahan", "PM")).toEqual(masked);
    expect(await personProfile(await db.as("nimal"), "LL-0417")).toBeNull();
    const registry = createRegistry(db.modules);
    expect(await registry.call(await db.as("sahan", "PM"), "get_keyflow_record", { recordId: (mine!.reviews as { id: string }[])[0].id }, { source: "mcp" })).toMatchObject({ kind: "review", personName: "Kasun Dias", record: masked });

    const all = await withTenant(db.app, T, (tx) => keyflowProfile(tx, contextFor.job(T, "insights.test"), kasun));
    expect(all?.reviews).toHaveLength(2);
    const fake = { tenantId: T, actor: { id: "job:x", kind: "system" as const }, source: "job" as const };
    await expect(withTenant(db.app, T, (tx) => keyflowProfile(tx, fake, kasun))).rejects.toThrow(/hr:read/);
    expect(await withTenant(db.app, T, (tx) => lastSync(tx))).toEqual({ lastRunAt: expect.any(String), lastStatus: "completed-with-errors", openErrors: 3 });
  });
});
