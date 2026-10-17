import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { chatTurn, confirmAction } from "@amax/chat";
import { putSecret } from "@amax/core/secrets";
import { contextFor } from "@amax/core/server";
import { adminDb, T } from "./fixture";

const everyTable = async (owner: Awaited<ReturnType<typeof adminDb>>["t"]["owner"]) => {
  const tables = await owner`select table_schema || '.' || table_name as t from information_schema.tables where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')`;
  return (await Promise.all(tables.map(async ({ t }) => (await owner.unsafe(`select coalesce(string_agg(x::text, E'\\n'), '') as d from ${t} x`))[0].d as string))).join("\n");
};

describe.skipIf(!hasDb)("047 AC-4 a typed secret goes only to the vault (Postgres)", () => {
  let db: Awaited<ReturnType<typeof adminDb>>;
  beforeAll(async () => {
    db = await adminDb();
    await putSecret(contextFor.job(T, "seed"), { connector: "github", value: "test-seed-github-value" });
  });
  afterAll(() => db?.t.drop());

  it("AC4 the value is absent from the model's input, chat.conversation, ai.call, the audit and the logs", async () => {
    const VALUE = `test-typed-${randomBytes(16).toString("hex")}`;
    const logged: string[] = [];
    for (const m of ["log", "error", "warn", "info"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(" ")));
    const provider = fakeProvider([
      () => ({ toolCalls: [{ type: "tool_use", id: "c1", name: "rotate_secret", input: { connector: "github", value: "made-up-by-model" } }] }),
      () => ({ text: "Type the new value on the card." }),
      () => ({ text: "Rotated." }),
    ]);
    configureAi({ provider, db: db.app, model: "claude-haiku-5-5" });
    const maya = await db.as("maya");
    const turn = await chatTurn(db.app, db.registry, maya, { text: "rotate the GitHub token" });
    const card = turn.pending[0];
    expect(card).toMatchObject({ tool: "rotate_secret", input: { connector: "github" }, secret: { label: "New value" } });
    expect(card.input).not.toHaveProperty("value");

    await expect(confirmAction(db.app, db.registry, maya, turn.conversationId, card.id)).rejects.toThrow(/type the new value first/);
    await expect(db.registry.call(maya, "rotate_secret", { connector: "github", value: VALUE }, { source: "mcp" })).rejects.toThrow(/masked field/);
    await confirmAction(db.app, db.registry, maya, turn.conversationId, card.id, { secret: VALUE });
    await chatTurn(db.app, db.registry, maya, { conversationId: turn.conversationId, text: "did that work?" });

    expect((await db.t.owner`select max(version)::int as v from secrets.version`)[0].v).toBe(2);
    expect(JSON.stringify(provider.calls)).not.toContain(VALUE);
    // Every table, so chat.conversation, ai.call, core.audit_event and core.idempotency among them.
    expect(await everyTable(db.t.owner)).not.toContain(VALUE);
    expect(logged.join("\n")).not.toContain(VALUE);
    vi.restoreAllMocks();
  });
});
