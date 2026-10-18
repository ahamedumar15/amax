import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry } from "@amax/mcp";
import { chatTurn, confirmAction, type Intent } from "@amax/chat";
import manifest from "../module";
import { chatIntents } from "../chat";
import { learningDb, T } from "./db";

const root = join(import.meta.dirname, "..");

describe("AC-2 chat does the writes", () => {
  it("AC2 the new-programme intent names create_programme, and the screen has no form, dialog or direct write", () => {
    expect(manifest.chatIntents).toEqual(chatIntents);
    expect(chatIntents.map((i) => [i.id, i.tool, i.required])).toEqual([["learning.new-programme", "create_programme", ["title", "kind", "delivery", "startsOn"]]]);
    expect(existsSync(join(root, "actions.ts"))).toBe(false);
    for (const f of readdirSync(join(root, "ui")).filter((n) => n.endsWith(".tsx"))) {
      const src = readFileSync(join(root, "ui", f), "utf8");
      expect([f, /<form|<dialog|<input|"use server"|from "\.\.\/server\/(programmes|enrolment|certifications)"/.test(src)]).toEqual([f, false]);
    }
  });
});

describe.skipIf(!hasDb)("AC-2 writes wait for chat's confirm (Postgres, scripted model)", () => {
  let db: Awaited<ReturnType<typeof learningDb>>;
  beforeAll(async () => {
    db = await learningDb();
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
  }, 60_000);
  afterAll(() => db?.t.drop());

  const run = async (name: string, input: Record<string, unknown>, intent?: Intent) => {
    const hr = await db.as("maya", "HR");
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name, input }] }), () => ({ text: "Confirm?" })]), db: db.app, model: "claude-haiku-5-5" });
    const registry = createRegistry(db.modules);
    const turn = await chatTurn(db.app, registry, hr, { text: `please ${name}`, intent });
    expect(turn.pending.map((p) => p.tool)).toEqual([name]);
    return () => confirmAction(db.app, registry, hr, turn.conversationId, turn.pending[0].id);
  };

  it("AC2 a new programme from the intent and a reminder each become a confirm card, written and audited as chat once confirmed", async () => {
    const confirm = await run("create_programme", { title: "Threat modelling (fictional)", kind: "workshop", delivery: "internal", startsOn: "2026-11-02" }, chatIntents[0] as unknown as Intent);
    expect(await db.q(sql`select 1 from learning.programme where title = 'Threat modelling (fictional)'`)).toHaveLength(0);
    expect((await confirm()).result).toMatchObject({ number: "LP-0019" });
    const [c] = await db.q(sql`select id from learning.certification where name = 'AZ-305 Solutions Architect'`);
    const remind = await run("remind_certification", { certificationId: c.id });
    expect(await db.q(sql`select 1 from learning.reminder`)).toHaveLength(0);
    await remind();
    expect(await db.q(sql`select kind from learning.reminder`)).toEqual([{ kind: "manual" }]);
    const audits = await db.q(sql`select action, source from core.audit_event where action like 'learning.%' order by seq`);
    expect(audits).toEqual([{ action: "learning.programme.create", source: "chat" }, { action: "learning.certification.remind", source: "chat" }]);
  });
});
