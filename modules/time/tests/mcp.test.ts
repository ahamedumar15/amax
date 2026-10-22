import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { chatTurn, confirmAction } from "@amax/chat";
import { createRegistry } from "@amax/mcp";
import manifest from "../module";
import { T, timeDb } from "./db";

describe.skipIf(!hasDb)("MCP tools (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC4 log_time, submit_week and approve_week run as the caller, audited, and MCP time counts as agent time", async () => {
    const registry = createRegistry([manifest]);
    const [maya, tharushi, liam] = await Promise.all([db.as("maya", "PM"), db.as("tharushi"), db.as("liam")]);
    expect(registry.toolsFor(tharushi).map((t) => t.name)).toEqual(expect.arrayContaining(["log_time", "submit_week", "get_my_week"]));
    await registry.call(tharushi, "log_time", { projectKey: "FLT", day: "2026-10-16", hours: 1.5, agent: "Claude for Tharushi" }, { source: "mcp" });
    const [entry] = await db.q(sql`select source, agent, hours from time.entry where day = '2026-10-16' and logged_by = ${`user:${tharushi.userId}`}`);
    expect(entry).toEqual({ source: "agent", agent: "Claude for Tharushi", hours: "1.50" });
    await registry.call(tharushi, "submit_week", { week: "2026-W42" }, { source: "mcp" });
    await expect(registry.call(liam, "approve_week", { person: "tharushi@lumenlabs.test", week: "2026-W42" }, { source: "mcp" })).rejects.toThrow(/forbidden/);
    await expect(registry.call(maya, "approve_week", { person: "tharushi@lumenlabs.test", week: "2026-W42" }, { source: "mcp" })).resolves.toMatchObject({ status: "approved" });
    const audit = await db.q(sql`select action, source from core.audit_event where action like 'time.%' order by seq`);
    expect(audit).toEqual([{ action: "time.entry.log", source: "mcp" }, { action: "time.week.submit", source: "mcp" }, { action: "time.week.approve", source: "mcp" }]);
    const mine = (await registry.call(tharushi, "get_my_week", { week: "2026-W42" }, { source: "mcp" })) as { total: number; status: string };
    expect(mine).toMatchObject({ total: 30.5, status: "approved" });
  });

  it("070 AC5 a row's entries come back with ids, and correct_time_entry writes only after chat's confirm", async () => {
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
    const registry = createRegistry([manifest]);
    const dinesh = await db.as("dinesh");
    const sheet = (await registry.call(dinesh, "get_timesheet", { week: "2026-W42", project: "Fleet Tracker" }, { source: "chat" })) as { entries: { id: string; projectName: string; hours: number }[] };
    expect(sheet.entries.length).toBeGreaterThan(0);
    expect(sheet.entries.every((e) => e.projectName === "Fleet Tracker")).toBe(true);
    const target = sheet.entries[0];
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name: "correct_time_entry", input: { entryId: target.id, hours: 0.5 } }] }), () => ({ text: "Confirm?" })]), db: db.app, model: "claude-haiku-5-5" });
    const turn = await chatTurn(db.app, registry, dinesh, { text: "Fix my Fleet Tracker hours for 2026-W42: make it 0.5 h" });
    expect(turn.pending.map((p) => p.tool)).toEqual(["correct_time_entry"]);
    expect(Number((await db.q(sql`select hours from time.entry where id = ${target.id}`))[0].hours)).toBe(target.hours);
    await confirmAction(db.app, registry, dinesh, turn.conversationId, turn.pending[0].id);
    expect(await db.q(sql`select hours::float as hours, revision from time.entry where id = ${target.id}`)).toEqual([{ hours: 0.5, revision: 2 }]);
    expect(await db.q(sql`select source from core.audit_event where action = 'time.entry.correct' and resource_id = ${target.id}`)).toEqual([{ source: "chat" }]);
  }, 60_000);

  it("070 AC9 write tools need the week: submit_week without one, or approve_week naming a person without one, is refused", async () => {
    const registry = createRegistry([manifest]);
    const [dinesh, sahan] = await Promise.all([db.as("dinesh"), db.as("sahan")]);
    await expect(registry.call(dinesh, "submit_week", {}, { source: "mcp" })).rejects.toThrow(/invalid input|week/i);
    await expect(registry.call(sahan, "approve_week", { person: "kasun@lumenlabs.test" }, { source: "mcp" })).rejects.toThrow(/say which ISO week/);
  });
});
