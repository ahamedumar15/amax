import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { acceptSuggestion, undoSuggestion } from "@amax/agents/server";
import { applyDue } from "../server/apply";
import { getProduct } from "../server/queries";
import { ctxFor } from "../server/read";
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
    expect(await getProduct(ravi, p.id as string)).toMatchObject({ assigned: 29, idle: 0, idleSeats: [] });
    expect(await db.q(sql`select count(*)::int as n, min(approved_by) as by from it_access.change where action = 'remove-seat' and status = 'manual'`)).toEqual([{ n: 9, by: `user:${ravi.userId}` }]);

    await undoSuggestion(ctxFor(ravi), { id: figma });
    await applyDue(T);
    expect((await getProduct(ravi, p.id as string))!.assigned).toBe(38);
    expect(await db.q(sql`select count(*)::int as n from it_access.change where action = 'restore' and status = 'manual'`)).toEqual([{ n: 9 }]);
  }, 240_000);
});
