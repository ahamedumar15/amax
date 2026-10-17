import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { chatTurn, confirmAction, getConversation, listConversations, openCards, type PendingAction } from "../src";
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

describe.skipIf(!hasDb)("052 chat history and confirm trace (Postgres)", () => {
  let world: Awaited<ReturnType<typeof chatWorld>>;
  let app: Db, maya: Viewer;
  let convo: string;
  const setCards = (pending: PendingAction[], decided: Record<string, string> = {}) =>
    withTenant(app, T, (tx) => tx.execute(sql`update chat.conversation set pending = ${JSON.stringify(pending)}::jsonb, decided = ${JSON.stringify(decided)}::jsonb where id = ${convo}`));
  const decidedSteps = (traceId: string) =>
    withTenant(app, T, (tx) => tx.execute(sql`select kind, detail ->> 'outcome' as outcome from core.trace_event where trace_id = ${traceId}::uuid order by seq`));

  beforeAll(async () => {
    world = await chatWorld();
    app = world.app;
    maya = await world.as("maya");
    scripted(app, [() => ({ text: "Noted." })]);
    convo = (await chatTurn(app, registry, maya, { text: "Keep a note for later" })).conversationId;
  });
  afterAll(() => world?.t.drop());

  it("getConversation and listConversations skip decided cards; only undecided expired ones count", async () => {
    await setCards([card("x1", OLD), card("x2", OLD), card("x3", NOW())], { x1: "confirmed" });
    expect((await getConversation(app, maya, convo))!.pending.map((p) => [p.id, p.expired])).toEqual([["x2", true], ["x3", false]]);
    expect((await listConversations(app, maya)).find((c) => c.id === convo)!.expiredCount).toBe(1);
  });

  it.each([
    { name: "a card that needs a secret", extra: { secret: { label: "Value" } }, at: NOW, rejects: /type the value first/, steps: [["decided", "needs_secret"]] },
    { name: "an expired card", extra: {}, at: () => OLD, rejects: /expired/, steps: [["decided", "expired"]] },
    { name: "a card that runs", extra: {}, at: NOW, rejects: null, steps: [["decided", "run"], ["tool_call", "ok"]] },
  ])("confirming $name records the decided step with what came of it", async ({ extra, at, rejects, steps }) => {
    const traceId = randomUUID();
    scripted(app, [() => ({ text: "Noted." })]);
    const target = (await chatTurn(app, registry, maya, { text: "a chat to archive" })).conversationId;
    const id = randomUUID();
    await setCards([card(id, at(), { ...extra, input: { id: target }, traceId })]);
    const run = confirmAction(app, registry, maya, convo, id);
    if (rejects) await expect(run).rejects.toThrow(rejects);
    else await run;
    expect((await decidedSteps(traceId)).map((s) => [s.kind, s.outcome])).toEqual(steps);
  });
});
