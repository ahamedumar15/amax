import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry } from "@amax/mcp";
import { chatTurn, confirmAction } from "@amax/chat";
import { leaveDb, T } from "./db";

const root = join(import.meta.dirname, "..");

describe("AC3 the Leave screen has no forms or direct writes", () => {
  it("AC3 no form, dialog or server action in the leave UI", () => {
    expect(existsSync(join(root, "actions.ts"))).toBe(false);
    for (const f of readdirSync(join(root, "ui")).filter((n) => n.endsWith(".tsx"))) {
      const src = readFileSync(join(root, "ui", f), "utf8");
      expect([f, /<form|<dialog|"use server"|from "\.\.\/server\/(request|decide|cancel|policies)"/.test(src)]).toEqual([f, false]);
    }
  });
});

describe.skipIf(!hasDb)("leave through chat, pins and masked medical details (Postgres)", () => {
  let db: Awaited<ReturnType<typeof leaveDb>>;
  let registry: ReturnType<typeof createRegistry>;
  beforeAll(async () => {
    db = await leaveDb();
    registry = createRegistry(db.modules);
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC3 \"request leave\" becomes a confirm card and writes only once confirmed, audited as chat", async () => {
    const dinesh = await db.as("dinesh");
    const args = { type: "casual", startsOn: "2026-11-05" };
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name: "request_leave", input: args }] }), () => ({ text: "Confirm?" })]), db: db.app, model: "claude-haiku-5-5" });
    const turn = await chatTurn(db.app, registry, dinesh, { text: "request leave on Nov 5" });
    expect(turn.pending.map((p) => p.tool)).toEqual(["request_leave"]);
    const count = async () => (await db.q(sql`select count(*)::int as n from leave.request where person_name = 'Dinesh Wickrama'`))[0].n;
    expect(await count()).toBe(0);
    await confirmAction(db.app, registry, dinesh, turn.conversationId, turn.pending[0].id);
    expect(await count()).toBe(1);
    expect((await db.q(sql`select source from core.audit_event where action = 'leave.request.create' order by seq desc limit 1`))[0].source).toBe("chat");
    expect(db.modules.find((m) => m.id === "leave")?.chatIntents).toEqual([expect.objectContaining({ id: "leave.request", tool: "request_leave" })]);
  }, 60_000);

  it("AC1 a medical reason and certificate show to the person and HR only; row and calendar pins resolve to exactly that record", async () => {
    const id = await db.requestOf("kasun", "2026-10-08");
    const get = async (key: string, role?: "HR" | "PM") => registry.call(await db.as(key, role), "get_leave_request", { requestId: id }, { source: "chat" }) as Promise<Record<string, unknown> | null>;
    expect(await get("kasun")).toMatchObject({ id, person: "Kasun Dias", medicalReason: "Fever (fictional demo record)" });
    expect(await get("maya", "HR")).toMatchObject({ medicalReason: "Fever (fictional demo record)", certificateRef: expect.stringContaining("fictional") });
    expect(await get("maya", "PM")).toMatchObject({ type: "medical", medicalReason: { masked: true, class: "health" }, certificateRef: { masked: true, class: "health" } });
    expect(await get("nimal")).toBeNull();
    const maya = await db.as("maya", "PM");
    const row = (await registry.call(maya, "get_team_calendar", { month: "2026-10", userId: (await db.as("ayesha")).userId }, { source: "chat" })) as { rows: { name: string; marks: (string | null)[] }[] };
    expect(row.rows.map((r) => [r.name, r.marks[15]])).toEqual([["Ayesha Rahman", "casual"]]);
    expect(await registry.call(await db.as("kasun"), "get_team_calendar", { month: "2026-10", userId: (await db.as("ayesha")).userId }, { source: "chat" })).toBeNull();
  }, 60_000);
});
