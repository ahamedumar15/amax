import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { acceptSuggestion, createSuggestion, getSuggestion, listSuggestions } from "../src/server";
import { agentFor, agentsDb, ANA, ELSEWHERE, KASUN, person, PROJECT, proposal, viewer } from "./setup";

describe.skipIf(!hasDb)("006 AC-5 data scope", () => {
  let db: Awaited<ReturnType<typeof agentsDb>>;
  beforeAll(async () => { db = await agentsDb(); });
  afterAll(() => db?.t.drop());

  it("AC5 a suggestion outside the viewer's scope is never listed, resolved or decided; classified fields are masked", async () => {
    const mine = await createSuggestion(agentFor(ANA), proposal());
    const theirs = await createSuggestion(agentFor(ANA), proposal({ title: "Raise the other project's limit", target: { type: "demo.setting", id: "other-limit", label: "Other limit" }, scope: { projectId: ELSEWHERE } }));
    const pay = await createSuggestion(agentFor(ANA), proposal({ kind: "demo.pay", proposed: { key: "pay", value: 900 } }));
    const pm = viewer(KASUN, ["PM"], [PROJECT]);
    expect((await listSuggestions(pm, { bucket: "open" })).map((s) => s.id).sort()).toEqual([mine.id, pay.id].sort());
    expect(await getSuggestion(pm, theirs.id)).toBeNull();
    expect(await listSuggestions(viewer(KASUN, ["Engineer"]))).toEqual([]);
    expect((await getSuggestion(pm, pay.id))!.proposed).toEqual({ key: "pay", value: { masked: true, class: "pay" } });
    await expect(acceptSuggestion(person(pm), { id: theirs.id })).rejects.toThrow(/outside your data scope/);
    expect(await db.setting("limit")).toBeNull();
  });
});
