import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb, tablesMissingRls } from "@amax/db/testdb";
import { createSuggestion, getSuggestion } from "../src/server";
import { agentFor, agentsDb, ANA, MAYA, OTHER, proposal, T, viewer } from "./setup";

describe.skipIf(!hasDb)("006 AC-1 agents.suggestion", () => {
  let db: Awaited<ReturnType<typeof agentsDb>>;
  beforeAll(async () => { db = await agentsDb(); });
  afterAll(() => db?.t.drop());

  it("AC1 stores kind, target, proposed change, evidence, confidence, source and expiry; refuses a change its kind's schema rejects", async () => {
    const made = await createSuggestion(agentFor(ANA), proposal({ source: { channel: "email", label: "Email from a.lee@harbour.test", ref: "msg-1" }, expiresInDays: 3 }));
    const s = (await getSuggestion(viewer(MAYA, ["Admin"]), made.id))!;
    expect(s).toMatchObject({ kind: "demo.setting", target: { type: "demo.setting", id: "limit", label: "Limit" }, proposed: { key: "limit", value: 5 }, confidence: 0.8, status: "open",
      evidence: [{ type: "record", label: "Usage last month", ref: "demo:usage" }], source: { channel: "email", label: "Email from a.lee@harbour.test", ref: "msg-1", external: true },
      agent: { id: "job:agents.test", name: "Demo agent" }, actsFor: { id: `user:${ANA}` } });
    expect(await createSuggestion(agentFor(ANA), proposal())).toMatchObject({ id: made.id, existing: true });
    expect(new Date(s.expiresAt).getTime() - Date.now()).toBeGreaterThan(2.9 * 86_400_000);
    await expect(createSuggestion(agentFor(ANA), proposal({ proposed: { key: "limit", value: "five" } }))).rejects.toThrow(/proposed\.value/);
    await expect(createSuggestion(agentFor(ANA), proposal({ source: { channel: "email" } }))).rejects.toThrow(/external source needs a label/);
    await expect(createSuggestion(agentFor(ANA), proposal({ kind: "demo.unknown" }))).rejects.toThrow(/no suggestion kind/);
    expect(await withTenant(db.app, OTHER, (tx) => tx.execute(sql`select id from agents.suggestion`))).toHaveLength(0);
    expect(await withTenant(db.app, T, (tx) => tx.execute(sql`select id from agents.suggestion`))).toHaveLength(1);
    expect((await tablesMissingRls(db.t.owner)).filter((n) => n.startsWith("agents."))).toEqual([]);
  });
});
