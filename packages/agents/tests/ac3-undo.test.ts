import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { acceptSuggestion, createSuggestion, getSuggestion, undoSuggestion } from "../src/server";
import { agentFor, agentsDb, ANA, KASUN, MAYA, person, proposal, viewer } from "./setup";

describe.skipIf(!hasDb)("006 AC-3 undo and second approvers", () => {
  let db: Awaited<ReturnType<typeof agentsDb>>;
  beforeAll(async () => { db = await agentsDb(); });
  afterAll(() => db?.t.drop());

  it("AC3 undo runs the inverse for 7 days or until the kind's cutoff; an irreversible kind needs a second approver and can't be undone", async () => {
    const maya = person(viewer(MAYA, ["Admin"]));
    const one = await createSuggestion(agentFor(ANA), proposal());
    const accepted = await acceptSuggestion(maya, { id: one.id });
    const days = (new Date(accepted.undoUntil!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    await undoSuggestion(maya, { id: one.id });
    expect(await db.setting("limit")).toBeNull();
    expect((await db.audit("demo.setting.set")).map((a) => (a.after as { value: number | null }).value)).toEqual([5, null]);
    expect(await db.audit("agents.suggestion.undo")).toHaveLength(1);

    const cut = await createSuggestion(agentFor(ANA), proposal({ proposed: { key: "locked", value: 2, cutoff: new Date(Date.now() + 60_000).toISOString() } }));
    const locked = await acceptSuggestion(maya, { id: cut.id });
    expect(new Date(locked.undoUntil!).getTime()).toBeLessThan(Date.now() + 61_000);
    await db.t.owner`update agents.suggestion set undo_until = now() - interval '1 second' where id = ${cut.id}`;
    await expect(undoSuggestion(maya, { id: cut.id })).rejects.toThrow(/undo window closed/);
    expect(await db.setting("locked")).toBe(2);

    const bank = await createSuggestion(agentFor(KASUN), proposal({ kind: "demo.bankfile", proposed: { key: "bank", value: 1 } }));
    expect(await acceptSuggestion(maya, { id: bank.id })).toMatchObject({ status: "approved" });
    expect(await db.setting("bank")).toBeNull();
    await expect(acceptSuggestion(maya, { id: bank.id })).rejects.toThrow(/second, different person/);
    await acceptSuggestion(person(viewer(ANA, ["Admin"])), { id: bank.id });
    expect(await db.setting("bank")).toBe(1);
    expect(await getSuggestion(viewer(MAYA, ["Admin"]), bank.id)).toMatchObject({ status: "accepted", irreversible: true, undoUntil: null, canUndo: false, firstApprovedBy: { id: `user:${MAYA}` }, decidedBy: { id: `user:${ANA}` } });
    await expect(undoSuggestion(maya, { id: bank.id })).rejects.toThrow(/can't be undone/);
  });
});
