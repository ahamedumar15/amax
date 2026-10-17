import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { chatTurn, confirmAction } from "@amax/chat";
import { revealOf } from "../../lib/chat-outcome";
import { adminDb } from "./fixture";

const everyTable = async (owner: Awaited<ReturnType<typeof adminDb>>["t"]["owner"]) => {
  const tables = await owner`select table_schema || '.' || table_name as t from information_schema.tables where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')`;
  return (await Promise.all(tables.map(async ({ t }) => (await owner.unsafe(`select coalesce(string_agg(x::text, E'\\n'), '') as d from ${t} x`))[0].d as string))).join("\n");
};

describe.skipIf(!hasDb)("035 AC-2 a new API key is shown once, on the confirm card only (Postgres)", () => {
  let db: Awaited<ReturnType<typeof adminDb>>;
  beforeAll(async () => { db = await adminDb(); });
  afterAll(() => db?.t.drop());

  it("AC2 the key is absent from the model's input, chat.conversation, ai.call, the trace, the audit and the logs", async () => {
    const logged: string[] = [];
    for (const m of ["log", "error", "warn", "info", "debug"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(" ")));
    const provider = fakeProvider([
      () => ({ toolCalls: [{ type: "tool_use", id: "c1", name: "create_api_credential", input: { name: "specclaw CI", scopes: ["delivery:write"], actsFor: ["kasun@lumenlabs.test"], days: 180 } }] }),
      () => ({ text: "Check the card and confirm." }),
      () => ({ text: "It's created." }),
    ]);
    configureAi({ provider, db: db.app, model: "claude-haiku-5-5" });
    const maya = await db.as("maya");
    const turn = await chatTurn(db.app, db.registry, maya, { text: "create a CI credential" });
    const card = turn.pending[0];
    expect(card).toMatchObject({ tool: "create_api_credential", input: { name: "specclaw CI" } });

    const { result } = await confirmAction(db.app, db.registry, maya, turn.conversationId, card.id);
    const reveal = revealOf(result);
    expect(reveal?.value).toMatch(/^amx_sp_[\w-]{32}$/);
    const KEY = reveal!.value;
    await chatTurn(db.app, db.registry, maya, { conversationId: turn.conversationId, text: "did that work?" });
    await expect(confirmAction(db.app, db.registry, maya, turn.conversationId, card.id)).rejects.toThrow(/already confirmed/);
    await expect(db.registry.call(maya, "create_api_credential", { name: "Over MCP", scopes: ["delivery:read"], days: 30 }, { source: "mcp" })).rejects.toThrow(/shown once/);

    expect(JSON.stringify(provider.calls)).not.toContain(KEY);
    const all = await everyTable(db.t.owner);
    expect(all).not.toContain(KEY);
    expect(all).toContain("specclaw CI");
    expect((await db.t.owner`select count(*)::int as n from core.audit_event where action = 'auth.principal.create'`)[0].n).toBe(1);
    expect((await db.t.owner`select count(*)::int as n from core.trace_event where tool = 'create_api_credential'`)[0].n).toBeGreaterThan(0);
    expect(logged.join("\n")).not.toContain(KEY);
    vi.restoreAllMocks();
  }, 60_000);
});
