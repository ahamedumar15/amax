import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import type { PinSpec } from "@amax/core";
import { createRegistry } from "@amax/mcp";
import { chatTurn, confirmAction } from "@amax/chat";
import { mcpTools } from "../mcp";
import { keyflowDb, T } from "./db";

const root = join(import.meta.dirname, "..");
const labelOf = (name: string, result: unknown) => (mcpTools.find((t) => t.name === name)!.pin as Exclude<PinSpec, "view">).of(result as never)?.label;

describe("AC2 the Keyflow screens have no forms or direct writes", () => {
  it("AC2 no form, dialog or server action in the keyflow UI", () => {
    expect(existsSync(join(root, "actions.ts"))).toBe(false);
    for (const f of readdirSync(join(root, "ui")).filter((n) => n.endsWith(".tsx"))) {
      expect([f, /<form|<dialog|"use server"|from "\.\.\/server\/(services|record|sync)"/.test(readFileSync(join(root, "ui", f), "utf8"))]).toEqual([f, false]);
    }
  });
});

describe.skipIf(!hasDb)("Keyflow through chat, and pins (Postgres)", () => {
  let db: Awaited<ReturnType<typeof keyflowDb>>;
  let registry: ReturnType<typeof createRegistry>;
  beforeAll(async () => {
    db = await keyflowDb();
    registry = createRegistry(db.modules);
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC2 \"connect Keyflow\" becomes a confirm card and writes only once confirmed, audited as chat; error and run pins resolve to that record; HR reads but can't dismiss", async () => {
    const ravi = await db.as("ravi");
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name: "connect_keyflow", input: { endpoint: "https://lumen.keyflow.example" } }] }), () => ({ text: "Confirm?" })]), db: db.app, model: "claude-haiku-5-5" });
    const turn = await chatTurn(db.app, registry, ravi, { text: "connect keyflow at https://lumen.keyflow.example" });
    expect(turn.pending.map((p) => p.tool)).toEqual(["connect_keyflow"]);
    const endpoint = async () => (await db.q(sql`select endpoint, sandbox from keyflow.connection`))[0];
    expect(await endpoint()).toEqual({ endpoint: null, sandbox: true });
    await confirmAction(db.app, registry, ravi, turn.conversationId, turn.pending[0].id);
    expect(await endpoint()).toEqual({ endpoint: "https://lumen.keyflow.example", sandbox: false });
    expect((await db.q(sql`select source from core.audit_event where action = 'keyflow.connection.set' order by seq desc limit 1`))[0].source).toBe("chat");

    const [err] = await db.q(sql`select id from keyflow.sync_error where person_name = 'Mohamed Rifkhan'`);
    const got = await registry.call(ravi, "get_keyflow_sync_error", { errorId: err.id }, { source: "chat" });
    expect([got, labelOf("get_keyflow_sync_error", got)]).toEqual([expect.objectContaining({ id: err.id, kind: "refused", runs: 2 }), "Keyflow sync error, Mohamed Rifkhan"]);
    const [run] = await db.q(sql`select id from keyflow.sync_run where status = 'failed'`);
    expect(await registry.call(ravi, "get_keyflow_sync_run", { runId: run.id }, { source: "chat" })).toMatchObject({ id: run.id, failure: "Keyflow answered 503" });
    const hr = await db.as("sahan", "HR");
    expect(await registry.call(hr, "get_keyflow_sync", {}, { source: "mcp" })).toMatchObject({ errors: expect.any(Array) });
    expect(registry.toolsFor(hr).map((t) => t.name)).not.toContain("dismiss_keyflow_sync_error");
    expect(registry.toolsFor(ravi).map((t) => t.name)).toEqual(expect.arrayContaining(["connect_keyflow", "dismiss_keyflow_sync_error"]));
    expect(await registry.call(ravi, "dismiss_keyflow_sync_error", { errorId: err.id }, { source: "mcp" })).toEqual({ id: err.id, dismissed: true });
    expect(db.modules.find((m) => m.id === "keyflow")?.chatIntents).toEqual([expect.objectContaining({ id: "keyflow.connect", tool: "connect_keyflow" })]);
  }, 60_000);
});
