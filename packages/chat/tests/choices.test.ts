import { z } from "zod";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import type { McpToolDef } from "@amax/core";
import { configureRuntime, defineService } from "@amax/core/server";
import { installAuthorizer, upsertPasswordUser, viewerForUser, type Viewer } from "@amax/auth";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry, ToolError } from "@amax/mcp";
import { cancelAction, chatTurn, confirmAction, NotPendingError } from "../src/engine";

// 076: a choice card is 2–4 ordinary pending cards sharing a `choice`; each is checked like a write call, and only one runs.
const T = "00000000-0000-4000-8000-000000000a76";
const ran: number[] = [];
const save = defineService({ name: "sample.hours.set", action: "sample.thing.create", resource: "sample.thing", input: z.object({ id: z.string(), hours: z.number() }),
  run: async (_tx, input) => { ran.push(input.hours); return { result: input, resourceId: input.id, after: input }; } });
const setHours = { name: "set_hours", description: "Set an entry's hours.", input: z.object({ id: z.string(), hours: z.number() }).strict(), permission: "sample.thing.create", scope: "write", service: save,
  propose: async (_v: Viewer, i: { hours: number }) => { if (i.hours > 24) throw new ToolError("a day can't have more than 24 h", "invalid_input"); },
  run: async (v: Viewer, input: { id: string; hours: number }) => save({ tenantId: v.tenantId, actor: { id: `user:${v.userId}`, kind: "user" }, source: "chat", viewer: v }, input) } as unknown as McpToolDef;
const option = (label: string, hours: number) => ({ label, tool: "set_hours", input: { id: label, hours } });

describe.skipIf(!hasDb)("076 choice cards", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: Viewer;
  const registry = createRegistry([{ id: "sample", mcpTools: [setHours] }]);
  const offer = async (options: ReturnType<typeof option>[]) => {
    const seen: unknown[] = [];
    configureAi({ db: app, model: "m", provider: fakeProvider([
      () => ({ toolCalls: [{ type: "tool_use" as const, id: "c1", name: "offer_choices", input: { question: "Which entry should change?", options } }] }),
      (req) => { seen.push(JSON.stringify(req)); return { text: "Pick one." }; },
    ]) });
    return { turn: await chatTurn(app, registry, maya, { text: "change Wednesday to 6 h" }), seen };
  };

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    installAuthorizer();
    await t.owner`insert into core.tenant (id, name) values (${T}, 'amax')`;
    await t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true)`;
    const id = await upsertPasswordUser(app, T, { email: "maya@amax.test", name: "Maya (fictional)", roles: ["Admin"], password: "a-long-password-1234" });
    maya = (await withTenant(app, T, (tx) => viewerForUser(tx, T, id)))!;
  });
  afterAll(() => t?.drop());

  it("AC7 options are checked like write calls: a refused one is left out; one left is a plain card; none is no card", async () => {
    const { turn, seen } = await offer([option("agent", 3.3), option("mine", 0.7), option("too much", 30)]);
    expect(turn.pending.map((p) => [p.input.id, p.choice?.label])).toEqual([["agent", "agent"], ["mine", "mine"]]);
    expect(new Set(turn.pending.map((p) => p.choice?.id)).size).toBe(1);
    expect(seen[0]).toContain("a day can't have more than 24 h");
    expect(turn.toolsRun).not.toContain("offer_choices");
    const single = (await offer([option("ok", 2), option("no", 40)])).turn.pending;
    expect(single.map((p) => [p.input.id, p.choice])).toEqual([["ok", undefined]]);
    expect((await offer([option("no", 40), option("nor", 50)])).turn.pending).toEqual([]);
  });

  it("AC7 confirming one option runs only it; the other is then refused as cancelled", async () => {
    const { turn } = await offer([option("a", 1), option("b", 2)]);
    ran.length = 0;
    await confirmAction(app, registry, maya, turn.conversationId, turn.pending[0].id);
    await expect(confirmAction(app, registry, maya, turn.conversationId, turn.pending[1].id)).rejects.toMatchObject({ decision: "cancelled" });
    expect(ran).toEqual([1]);
  });

  it("AC7 two options confirmed at once never both write", async () => {
    const { turn } = await offer([option("c", 3), option("d", 4)]);
    ran.length = 0;
    await Promise.allSettled(turn.pending.map((p) => confirmAction(app, registry, maya, turn.conversationId, p.id)));
    expect(ran.length).toBeLessThanOrEqual(1);
  });

  it("AC7 cancel on a choice card cancels every option", async () => {
    const { turn } = await offer([option("e", 5), option("f", 6), option("g", 7)]);
    await cancelAction(app, maya, turn.conversationId, turn.pending[0].id);
    const [row] = await withTenant(app, T, (tx) => tx.execute(sql`select pending, decided from chat.conversation where id = ${turn.conversationId}`));
    expect([(row.pending as unknown[]).length, Object.values(row.decided as object)]).toEqual([0, ["cancelled", "cancelled", "cancelled"]]);
    await expect(confirmAction(app, registry, maya, turn.conversationId, turn.pending[2].id)).rejects.toBeInstanceOf(NotPendingError);
  });
});
