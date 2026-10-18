import { z } from "zod";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import type { McpToolDef } from "@amax/core";
import { claimKey, withIdempotency } from "@amax/core/server";
import { createRegistry } from "@amax/mcp";
import { cancelAction, chatPlatform, chatTurn, confirmAction, getConversation, listConversations, openCards, type PendingAction } from "../src";
import { chatWorld, registry, scripted, T } from "./world";

const card = (id: string, createdAt: string, extra: Partial<PendingAction> = {}): PendingAction =>
  ({ id, tool: "archive_conversation", title: "Archive", input: {}, fields: ["id"], createdAt, ...extra });
const NOW = () => new Date().toISOString();
const OLD = "2026-01-01T00:00:00Z";

describe("052 history restores only undecided cards", () => {
  it.each([
    { name: "confirmed card left in pending", pending: [card("a", NOW())], decided: { a: "confirmed" }, open: [] },
    { name: "cancelled card left in pending", pending: [card("a", OLD)], decided: { a: "cancelled" }, open: [] },
    { name: "undecided card stays open", pending: [card("a", NOW())], decided: {}, open: ["a"] },
    { name: "mixed", pending: [card("a", OLD), card("b", OLD), card("c", NOW())], decided: { b: "unknown" }, open: ["a", "c"] },
  ])("$name", ({ pending, decided, open }) => {
    expect(openCards(pending, decided).map((p) => p.id)).toEqual(open);
  });
});

// A write tool whose value is typed on the card, so needs_secret has a real proposal too.
const vault = { id: "vault", mcpTools: [{ name: "set_code", description: "Set the door code.", input: z.object({}).strict(), scope: "write", permission: "", secretInput: { label: "Code" }, service: { spec: { name: "vault.code.set" } },
  run: async () => ({ ok: true }) } as unknown as McpToolDef] };
const withVault = createRegistry([chatPlatform, vault]);

describe.skipIf(!hasDb)("052 chat history and confirm trace (Postgres)", () => {
  let world: Awaited<ReturnType<typeof chatWorld>>;
  let app: Db, maya: Viewer;
  const rows = (q: ReturnType<typeof sql>) => withTenant(app, T, (tx) => tx.execute(q));
  const note = async (text: string) => {
    scripted(app, [() => ({ text: "Noted." })]);
    return (await chatTurn(app, registry, maya, { text })).conversationId;
  };
  // A real proposal: the model calls the write tool, chat turns it into a pending card.
  const propose = async (tool: string, input: Record<string, unknown>, reg = registry) => {
    scripted(app, [() => ({ toolCalls: [{ type: "tool_use", id: "c1", name: tool, input }] }), () => ({ text: "Confirm?" })]);
    const turn = await chatTurn(app, reg, maya, { text: `please ${tool}` });
    return { conversationId: turn.conversationId, card: turn.pending[0] };
  };
  const decided = async (traceId: string) =>
    (await rows(sql`select detail ->> 'outcome' as outcome from core.trace_event where trace_id = ${traceId}::uuid and kind = 'decided' order by seq`)).map((r) => r.outcome);

  beforeAll(async () => {
    world = await chatWorld();
    app = world.app;
    maya = await world.as("maya");
  });
  afterAll(() => world?.t.drop());

  it("after a real confirm and a real cancel, History restores neither card; an undecided expired one still counts", async () => {
    const yes = await propose("archive_conversation", { id: await note("one to archive") });
    const no = await propose("archive_conversation", { id: await note("one to keep") });
    const stale = await propose("archive_conversation", { id: await note("an old one") });
    await confirmAction(app, registry, maya, yes.conversationId, yes.card.id);
    await cancelAction(app, maya, no.conversationId, no.card.id);
    // Only the card's age is planted: nothing else can make a card old.
    await rows(sql`update chat.conversation set pending = jsonb_set(pending, '{0,createdAt}', '"2026-01-01T00:00:00Z"') where id = ${stale.conversationId}`);
    for (const c of [yes, no]) {
      expect((await getConversation(app, maya, c.conversationId))!.pending, c.card.id).toEqual([]);
      expect((await listConversations(app, maya)).find((x) => x.id === c.conversationId)!.expiredCount).toBe(0);
    }
    expect((await getConversation(app, maya, stale.conversationId))!.pending.map((p) => [p.id, p.expired])).toEqual([[stale.card.id, true]]);
    expect((await listConversations(app, maya)).find((x) => x.id === stale.conversationId)!.expiredCount).toBe(1);
  });

  it.each([
    { name: "a card that runs", setup: null, reg: "chat", rejects: null, outcome: "run" },
    { name: "a card that needs a typed value", setup: null, reg: "vault", rejects: /type the code first/, outcome: "needs_secret" },
    { name: "an expired card", setup: "expire", reg: "chat", rejects: /expired/, outcome: "expired" },
    { name: "a card whose write already ran (reply lost)", setup: "ran", reg: "chat", rejects: null, outcome: "already_done" },
    { name: "a card already cancelled (reply lost)", setup: "cancelled", reg: "chat", rejects: /cancelled/, outcome: "already_cancelled" },
  ] as const)("confirming $name records the decided step with what came of it", async ({ setup, reg, rejects, outcome }) => {
    const r = reg === "vault" ? withVault : registry;
    const { conversationId, card } = reg === "vault" ? await propose("set_code", {}, r) : await propose("archive_conversation", { id: await note("target") });
    const key = `chat:${card.id}`;
    if (setup === "expire") await rows(sql`update chat.conversation set pending = jsonb_set(pending, '{0,createdAt}', '"2026-01-01T00:00:00Z"') where id = ${conversationId}`);
    if (setup === "ran") await withIdempotency(key, () => r.call(maya, card.tool, card.input, { source: "chat" }));
    if (setup === "cancelled") await withTenant(app, T, (tx) => claimKey(tx, T, key, { cancelled: true }));
    const run = confirmAction(app, r, maya, conversationId, card.id);
    if (rejects) await expect(run).rejects.toThrow(rejects);
    else await run;
    expect(await decided(card.traceId!)).toEqual([outcome]);
  });
});
