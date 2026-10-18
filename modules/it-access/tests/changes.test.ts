import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { acceptSuggestion, undoSuggestion } from "@amax/agents/server";
import { contextFor } from "@amax/core/server";
import { applyDue } from "../server/apply";
import { confirmChange } from "../server/confirm";
import { getProduct } from "../server/queries";
import { ctxFor } from "../server/read";
import { accessView } from "../server/view";
import { sharedDb, T } from "./db";

describe.skipIf(!hasDb)("access changes through 006 (Postgres)", () => {
  const use = sharedDb(true);

  it("AC2 the licence agent's seat removal waits for IT to approve, is made on apply, and undo puts the seats back", async () => {
    const db = use();
    const [ravi, kasun] = [await db.as("ravi"), await db.as("kasun")];
    const open = await db.q(sql`select id, target_label, title, confidence from agents.suggestion where kind = 'it-access.remove-seats' order by target_label`);
    expect(open.map((s) => [s.target_label, s.title, Number(s.confidence)])).toEqual([
      ["Azure DevOps, Basic + Test Plans", "Remove 6 unused seats of Azure DevOps, Basic + Test Plans", 0.85], ["Figma Professional", "Remove 9 unused seats of Figma Professional", 0.92]]);
    expect(await db.q(sql`select 1 from it_access.change`)).toEqual([]);
    const figma = open[1].id as string;
    const [p] = await db.q(sql`select id from it_access.product where key = 'figma'`);

    await expect(acceptSuggestion(ctxFor(kasun), { id: figma })).rejects.toThrow();
    await acceptSuggestion(ctxFor(ravi), { id: figma });
    expect((await getProduct(ravi, p.id as string))!.assigned).toBe(38);
    await applyDue(T);
    expect(await getProduct(ravi, p.id as string)).toMatchObject({ assigned: 38, idle: 9 });
    expect(await db.q(sql`select count(*)::int as n, min(approved_by) as by from it_access.change where action = 'remove-seat' and status = 'manual'`)).toEqual([{ n: 9, by: `user:${ravi.userId}` }]);

    await undoSuggestion(ctxFor(ravi), { id: figma });
    await applyDue(T);
    expect((await getProduct(ravi, p.id as string))!.assigned).toBe(38);
    expect(await db.q(sql`select status, count(*)::int as n from it_access.change group by status`)).toEqual([{ status: "cancelled", n: 9 }]);
  }, 240_000);

  it("AC2 a revoke left to IT by hand changes nothing until a person confirms it was made, then the records follow", async () => {
    const db = use();
    const [maya, ravi] = [await db.as("maya"), await db.as("ravi")];
    const today = new Date().toISOString().slice(0, 10);
    await db.registry.call(maya, "record_leaver", { employeeNo: "LL-0291", leftOn: today }, { source: "mcp" });
    await db.tick();
    const [s] = await db.q(sql`select id from agents.suggestion where kind = 'it-access.revoke' and target_label = 'Ayesha Rahman'`);
    await acceptSuggestion(ctxFor(ravi), { id: s.id as string });
    await applyDue(T);
    const held = async () => (await accessView(ravi, "leavers")).people.find((x) => x.name === "Ayesha Rahman")!;
    expect(await held()).toMatchObject({ status: "left", licences: expect.any(Number) });
    const before = await held();
    expect(before.licences + before.entraGroups).toBeGreaterThan(0);
    const v = await accessView(ravi);
    expect(v.leaversWithAccess).toBe(1);
    expect(v.waiting.map((w) => [w.action, w.account])).toEqual([["revoke", "Ayesha Rahman"]]);

    await expect(confirmChange(contextFor.job(T, "test"), { changeId: v.waiting[0].changeId })).rejects.toThrow(/only a person/);
    await db.registry.call(ravi, "confirm_access_change", { changeId: v.waiting[0].changeId }, { source: "mcp" });
    expect(await held()).toMatchObject({ licences: 0, entraGroups: 0, adminRoles: [] });
    expect((await accessView(ravi)).waiting).toEqual([]);
    expect(await db.q(sql`select status, outcome from it_access.change where id = ${v.waiting[0].changeId}`)).toEqual([{ status: "applied", outcome: `Made by hand, confirmed by user:${ravi.userId}` }]);
    await expect(db.registry.call(ravi, "confirm_access_change", { changeId: v.waiting[0].changeId }, { source: "mcp" })).rejects.toThrow();
  }, 240_000);
});
