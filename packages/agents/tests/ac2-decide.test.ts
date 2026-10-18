import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { acceptSuggestion, createSuggestion, dismissSuggestion, getSuggestion, querySuggestion } from "../src/server";
import { agentFor, agentsDb, ANA, KASUN, MAYA, person, proposal, viewer } from "./setup";

describe.skipIf(!hasDb)("006 AC-2 decisions", () => {
  let db: Awaited<ReturnType<typeof agentsDb>>;
  beforeAll(async () => { db = await agentsDb(); });
  afterAll(() => db?.t.drop());

  it("AC2 only acceptance runs the change, audited with the agent and the person; a sensitive kind needs someone other than the person acted for", async () => {
    const maya = viewer(MAYA, ["Admin"]);
    const one = await createSuggestion(agentFor(ANA), proposal());
    await querySuggestion(person(maya), { id: one.id, note: "Why 5 and not 4?" });
    expect(await db.setting("limit")).toBeNull();
    expect(await getSuggestion(maya, one.id)).toMatchObject({ status: "queried", queryNote: "Why 5 and not 4?" });
    await expect(acceptSuggestion({ ...agentFor(ANA), viewer: maya }, { id: one.id })).rejects.toThrow(/a person must decide/);
    await expect(acceptSuggestion({ ...person({ ...maya, principal: { id: "p1", name: "Build bot" } }) }, { id: one.id })).rejects.toThrow(/a person must decide/);
    await acceptSuggestion(person(maya), { id: one.id });
    expect(await db.setting("limit")).toBe(5);
    const [write] = await db.audit("demo.setting.set");
    expect(write).toMatchObject({ actor: `user:${MAYA}`, after: { value: 5, via: { suggestionId: one.id, agent: "job:agents.test", agentName: "Demo agent", actsFor: `user:${ANA}` } } });
    const [decision] = await db.audit("agents.suggestion.accept");
    expect(decision).toMatchObject({ actor: `user:${MAYA}`, after: { decision: "accepted", by: `user:${MAYA}`, agent: "job:agents.test", actsFor: `user:${ANA}` } });
    await expect(acceptSuggestion(person(maya), { id: one.id })).rejects.toThrow(/is accepted/);

    const two = await createSuggestion(agentFor(KASUN), proposal({ proposed: { key: "other", value: 1 } }));
    await dismissSuggestion(person(maya), { id: two.id });
    expect(await db.setting("other")).toBeNull();

    const pay = await createSuggestion(agentFor(MAYA), proposal({ kind: "demo.pay", proposed: { key: "pay", value: 900 } }));
    await expect(acceptSuggestion(person(maya), { id: pay.id })).rejects.toThrow(/someone other than the person the agent acted for/);
    expect(await db.setting("pay")).toBeNull();
    await acceptSuggestion(person(viewer(ANA, ["Admin"])), { id: pay.id });
    expect(await db.setting("pay")).toBe(900);
  });
});
