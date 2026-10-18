import { sql } from "drizzle-orm";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import type { McpToolDef } from "@amax/core";
import { claimKey, registryFrom, runDueJobs, scheduleJob, withIdempotency } from "@amax/core/server";
import { createApiToken, type Viewer } from "@amax/auth";
import { createRegistry } from "@amax/mcp";
import { handleMcp } from "@amax/mcp/server";
import { cancelAction, chatPlatform, chatTurn, confirmAction } from "../src";
import { chatWorld, registry, scripted, T } from "./world";

const vault = createRegistry([chatPlatform, { id: "vault", mcpTools: [{ name: "set_code", description: "Set the door code.", input: z.object({}).strict(), scope: "write", permission: "", secretInput: { label: "Code" }, service: { spec: { name: "vault.code.set" } }, run: async () => ({ ok: true }) } as unknown as McpToolDef] }]);
const jobs = registryFrom([{ id: "sample", jobs: [{ name: "sample.nightly", run: async () => undefined }] }]);

describe.skipIf(!hasDb)("053 AC-4 every trace call site against a failing trace store (Postgres)", () => {
  let world: Awaited<ReturnType<typeof chatWorld>>;
  let app: Db, maya: Viewer;
  const rows = (q: ReturnType<typeof sql>) => withTenant(app, T, (tx) => tx.execute(q));
  const turn = (calls: { name: string; input: Record<string, unknown> }[], reg = registry) => {
    scripted(app, [() => (calls.length ? { toolCalls: calls.map((c, i) => ({ type: "tool_use" as const, id: `c${i}`, ...c })) } : { text: "Noted." }), () => ({ text: "Done." })]);
    return chatTurn(app, reg, maya, { text: "please" });
  };
  const card = async (reg = registry) => {
    const target = (await turn([])).conversationId;
    const t = await turn(reg === vault ? [{ name: "set_code", input: {} }] : [{ name: "archive_conversation", input: { id: target } }], reg);
    return { target, conversationId: t.conversationId, card: t.pending[0], key: `chat:${t.pending[0].id}` };
  };
  const confirm = async (setup: "ran" | "cancelled" | "expire" | null, reg = registry) => {
    const c = await card(reg);
    if (setup === "expire") await rows(sql`update chat.conversation set pending = jsonb_set(pending, '{0,createdAt}', '"2026-01-01T00:00:00Z"') where id = ${c.conversationId}`);
    if (setup === "ran") await withIdempotency(c.key, () => reg.call(maya, c.card.tool, c.card.input, { source: "chat" }));
    if (setup === "cancelled") await withTenant(app, T, (tx) => claimKey(tx, T, c.key, { cancelled: true }));
    return { c, run: () => confirmAction(app, reg, maya, c.conversationId, c.card.id) };
  };
  const mcp = async () => {
    const req = new Request("https://amax.test/api/mcp", { method: "POST",
      headers: { authorization: `Bearer ${await createApiToken(app, maya, { kind: "mcp", name: "test", days: 1 })}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } }) });
    return (await (await handleMcp(req, { db: app, registry, base: "https://amax.test" })).json()).result;
  };

  beforeAll(async () => {
    world = await chatWorld();
    app = world.app;
    maya = await world.as("maya");
    await world.t.owner.unsafe(`create function public.trace_down() returns trigger language plpgsql as $$ begin raise exception 'trace store down'; end $$`);
  });
  afterAll(() => world?.t.drop());

  const cases: { site: string; kind: string; check: () => Promise<void> }[] = [
    { site: "turn", kind: "turn", check: async () => expect((await turn([])).reply).toBe("Noted.") },
    { site: "tool_call", kind: "tool_call", check: async () => expect((await turn([{ name: "whoami", input: {} }])).toolsRun).toEqual(["whoami"]) },
    { site: "pending (AC-3: no card, the model is told)", kind: "pending", check: async () => {
      const t = await turn([{ name: "archive_conversation", input: { id: (await turn([])).conversationId } }]);
      expect(t.pending).toEqual([]);
      expect(await rows(sql`select jsonb_array_length(pending) as n, messages::text like '%not_proposed%' as told from chat.conversation where id = ${t.conversationId}`)).toEqual([{ n: 0, told: true }]);
    } },
    { site: "decided confirm, already done", kind: "decided", check: async () => expect((await confirm("ran")).run()).resolves.toMatchObject({ action: { tool: "archive_conversation" } }) },
    { site: "decided confirm, already cancelled", kind: "decided", check: async () => expect((await confirm("cancelled")).run()).rejects.toThrow(/already cancelled/) },
    { site: "decided confirm, expired", kind: "decided", check: async () => expect((await confirm("expire")).run()).rejects.toThrow(/already expired/) },
    { site: "decided confirm, needs the typed value", kind: "decided", check: async () => expect((await confirm(null, vault)).run()).rejects.toThrow(/type the code first/) },
    { site: "decided confirm, run: the one fail-closed site, the write never runs", kind: "decided", check: async () => {
      const { c, run } = await confirm(null);
      await expect(run()).rejects.toThrow(/insert into core.trace_event/);
      expect(await rows(sql`select archived_at from chat.conversation where id = ${c.target}`)).toEqual([{ archived_at: null }]);
      expect(await rows(sql`select count(*)::int as n from core.idempotency where key = ${c.key}`)).toEqual([{ n: 0 }]);
    } },
    { site: "decided cancel", kind: "decided", check: async () => {
      const c = await card();
      await expect(cancelAction(app, maya, c.conversationId, c.card.id)).resolves.toBeUndefined();
      expect(await rows(sql`select decided->>${c.card.id} as d from chat.conversation where id = ${c.conversationId}`)).toEqual([{ d: "cancelled" }]);
    } },
    { site: "mcp_call", kind: "mcp_call", check: async () => expect((await mcp()).isError).toBeUndefined() },
    { site: "job_run", kind: "job_run", check: async () => {
      await withTenant(app, T, (tx) => scheduleJob(tx, { tenantId: T, name: "sample.nightly" }));
      expect(await runDueJobs(app, jobs)).toMatchObject({ jobs: 1, jobsFailed: 0 });
    } },
  ];

  it.each(cases)("$site", async ({ kind, check }) => {
    await world.t.owner.unsafe(`create trigger trace_down before insert on core.trace_event for each row when (new.kind = '${kind}') execute function public.trace_down()`);
    try {
      await check();
    } finally {
      await world.t.owner.unsafe(`drop trigger trace_down on core.trace_event`);
    }
  }, 60_000);
});
