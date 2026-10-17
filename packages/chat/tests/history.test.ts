import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { chatTurn, confirmAction, getConversation, listConversations } from "../src";
import { chatWorld, registry, scripted, T } from "./world";

describe.skipIf(!hasDb)("049 chat history (Postgres)", () => {
  let world: Awaited<ReturnType<typeof chatWorld>>;
  let app: Db, maya: Viewer, sahan: Viewer;
  let first: string, second: string;
  const say = (text: string, conversationId?: string, pins = [] as { label: string; tool: string; args: Record<string, unknown> }[]) => {
    scripted(app, [() => ({ text: `Noted: ${text.slice(0, 20)}` })]);
    return chatTurn(app, registry, maya, { text, conversationId, pins });
  };

  beforeAll(async () => {
    world = await chatWorld();
    app = world.app;
    maya = await world.as("maya");
    sahan = await world.as("sahan");
    first = (await say(`  Add a risk to the   Northwind renewal ${"x".repeat(100)}`, undefined, [{ label: "Northwind", tool: "whoami", args: {} }])).conversationId;
    second = (await say("Who is on the bench in November?")).conversationId;
  });
  afterAll(() => world?.t.drop());

  it("AC1 the title is the first message, whitespace collapsed and cut to 80 characters", async () => {
    const [row] = await withTenant(app, T, (tx) => tx.execute(sql`select title, archived_at from chat.conversation where id = ${first}`));
    expect(row.title).toBe(`Add a risk to the Northwind renewal ${"x".repeat(44)}`);
    expect(row.archived_at).toBeNull();
  });

  it("AC2 lists own chats newest first with counts; search matches title and message text", async () => {
    const all = await listConversations(app, maya);
    expect(all.map((c) => c.id)).toEqual([second, first]);
    expect(all[1]).toMatchObject({ messageCount: 2, pinCount: 1, expiredCount: 0 });
    expect((await listConversations(app, maya, { query: "bench" })).map((c) => c.id)).toEqual([second]);
    expect((await listConversations(app, maya, { query: "Noted: Who" })).map((c) => c.id)).toEqual([second]);
    expect(await listConversations(app, maya, { query: "100%_" })).toEqual([]);
  });

  it("AC3 reopening restores messages, pins and cards; an expired card is marked and its confirm refused; sending appends", async () => {
    const stale = { id: "a1", tool: "archive_conversation", title: "Archive", input: { id: second }, fields: ["id"], createdAt: "2026-01-01T00:00:00Z" };
    await withTenant(app, T, (tx) => tx.execute(sql`update chat.conversation set pending = ${JSON.stringify([stale])}::jsonb where id = ${first}`));
    const c = (await getConversation(app, maya, first))!;
    expect(c.messages.map((m) => m.role)).toEqual(["me", "amax"]);
    expect(c.pins).toEqual([{ label: "Northwind", tool: "whoami", args: {} }]);
    expect(c.pending).toMatchObject([{ id: "a1", expired: true }]);
    await expect(confirmAction(app, registry, maya, first, "a1")).rejects.toMatchObject({ decision: "expired" });
    expect((await say("And one more thing", first)).conversationId).toBe(first);
    expect((await getConversation(app, maya, first))!.messages.at(-2)).toEqual({ role: "me", text: "And one more thing" });
  });

  it("AC4 another person, an Admin, gets nothing: not by function and not through the MCP tools", async () => {
    expect(await listConversations(app, sahan)).toEqual([]);
    expect(await getConversation(app, sahan, first)).toBeNull();
    expect(await registry.call(sahan, "list_conversations", {}, { source: "mcp" })).toEqual([]);
    await expect(registry.call(sahan, "get_conversation", { id: first }, { source: "mcp" })).rejects.toMatchObject({ code: "not_found" });
    await expect(chatTurn(app, registry, sahan, { conversationId: first, text: "hi" })).rejects.toThrow("conversation not found");
    await expect(registry.call(sahan, "archive_conversation", { id: first }, { source: "mcp" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("AC5 archive_conversation waits for the chat confirm, then runs audited as the person", async () => {
    scripted(app, [() => ({ toolCalls: [{ type: "tool_use", id: "u1", name: "archive_conversation", input: { id: second } }] }), () => ({ text: "Confirm?" })]);
    const turn = await chatTurn(app, registry, maya, { text: "archive the bench chat", conversationId: first });
    expect(turn.pending).toMatchObject([{ tool: "archive_conversation" }]);
    expect((await listConversations(app, maya)).map((c) => c.id)).toContain(second);
    await confirmAction(app, registry, maya, first, turn.pending[0].id);
    expect((await listConversations(app, maya)).map((c) => c.id)).toEqual([first]);
    const [audit] = await withTenant(app, T, (tx) => tx.execute(sql`select actor, source, resource_id from core.audit_event where action = 'chat.conversation.archive'`));
    expect(audit).toMatchObject({ actor: `user:${maya.userId}`, source: "chat", resource_id: second });
  });
});
