import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry } from "@amax/mcp";
import { chatTurn, confirmAction } from "@amax/chat";
import { installedModules } from "./installed";
import { T, timeDb } from "./db";

const root = join(import.meta.dirname, "..");

describe("054 AC-1 time screens have no forms or direct writes", () => {
  it("AC1 no form, dialog or server action in the time UI", () => {
    expect(existsSync(join(root, "actions.ts"))).toBe(false);
    for (const f of readdirSync(join(root, "ui")).filter((n) => n.endsWith(".tsx"))) {
      const src = readFileSync(join(root, "ui", f), "utf8");
      expect([f, /<form|<dialog|"use server"|from "\.\.\/actions"|from "\.\.\/server\/(log|submit|decide|reopen)"/.test(src)]).toEqual([f, false]);
    }
  });
});

describe.skipIf(!hasDb)("054 time writes wait for chat's confirm; row pins read one timesheet (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  let registry: ReturnType<typeof createRegistry>;
  beforeAll(async () => {
    db = await timeDb();
    registry = createRegistry(await installedModules());
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
  }, 60_000);
  afterAll(() => db?.t.drop());

  const status = async (key: string) => (await db.q(sql`select w.status from time.week w join auth.user u on u.id = w.user_id where u.email = ${`${key}@lumenlabs.test`} and w.iso_week = 42`))[0].status;

  it.each([
    ["submit_week", "tharushi", { week: "2026-W42" }, "tharushi", "draft", "submitted", "time.week.submit"],
    ["approve_week", "maya", { person: "nimal@lumenlabs.test", week: "2026-W42" }, "nimal", "submitted", "approved", "time.week.approve"],
  ] as const)("AC2 %s becomes a confirm card and writes only once confirmed, audited as chat", async (name, who, args, whose, before, after, action) => {
    const viewer = await db.as(who);
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name, input: args }] }), () => ({ text: "Confirm?" })]), db: db.app, model: "claude-haiku-5-5" });
    const turn = await chatTurn(db.app, registry, viewer, { text: `please ${name}` });
    expect(turn.pending.map((p) => p.tool)).toEqual([name]);
    expect(await status(whose)).toBe(before);
    await confirmAction(db.app, registry, viewer, turn.conversationId, turn.pending[0].id);
    expect(await status(whose)).toBe(after);
    const [audit] = await db.q(sql`select source from core.audit_event where action = ${action} order by seq desc limit 1`);
    expect(audit.source).toBe("chat");
  }, 60_000);

  it("AC3 get_timesheet resolves a Team time row and a My timesheet row to exactly that record", async () => {
    const [maya, kasun] = await Promise.all([db.as("maya", "PM"), db.as("kasun")]);
    const [{ id }] = await db.q(sql`select w.id from time.week w join auth.user u on u.id = w.user_id where u.email = 'kasun@lumenlabs.test' and w.iso_week = 42`);
    const row = (await registry.call(maya, "get_timesheet", { weekId: id }, { source: "chat" })) as { weekId: string; personName: string; week: string };
    expect([row.weekId, row.personName, row.week]).toEqual([id, "Kasun Dias", "2026-W42"]);
    const mine = (await registry.call(kasun, "get_my_week", { week: "2026-W42" }, { source: "chat" })) as { rows: { projectName: string }[] };
    const project = mine.rows[0].projectName;
    const one = (await registry.call(kasun, "get_timesheet", { week: "2026-W42", project }, { source: "chat" })) as { rows: { projectName: string }[] };
    expect(one.rows.map((r) => r.projectName)).toEqual([project]);
  }, 60_000);
});
