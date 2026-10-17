import { sql } from "drizzle-orm";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import type { McpToolDef } from "@amax/core";
import { configureRuntime, contextFor, defineService, registryFrom, runDueJobs, scheduleJob } from "@amax/core/server";
import { createApiToken, installAuthorizer, upsertPasswordUser, viewerForUser, type Viewer } from "@amax/auth";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry } from "@amax/mcp";
import { handleMcp } from "@amax/mcp/server";
import { chatTurn, confirmAction } from "../src/engine";

const T = "00000000-0000-4000-8000-000000000a01";
const addThing = defineService({ name: "sample.thing.create", action: "sample.thing.create", resource: "sample.thing", input: z.object({ name: z.string() }),
  run: async (_tx, input) => ({ result: { key: "TH-1" }, resourceId: "TH-1", after: input }) });
const ctx = (v: Viewer, source: "chat" | "mcp") => ({ tenantId: v.tenantId, actor: { id: `user:${v.userId}`, kind: "user" as const }, source, viewer: v });
const tools = [
  { name: "get_thing", description: "Get a thing.", input: z.object({}).strict(), permission: "sample.thing.read", scope: "read", run: async () => ({ name: "thing" }) },
  { name: "add_thing", description: "Add a thing.", input: z.object({ name: z.string() }).strict(), permission: "sample.thing.create", scope: "write",
    run: async (v: Viewer, input: { name: string }, source: "chat" | "mcp") => addThing(ctx(v, source), input) },
] as unknown as McpToolDef[];

describe.skipIf(!hasDb)("050 AC-1 one trace id per chat turn, MCP call and job run", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: Viewer;
  const registry = createRegistry([{ id: "sample", mcpTools: tools }]);
  const rows = (q: ReturnType<typeof sql>) => withTenant(app, T, (tx) => tx.execute(q));

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

  it("AC-1 a chat turn, its confirm, an MCP call and a job run each carry one trace id across ai.call, trace_event and audit_event", async () => {
    configureAi({ db: app, model: "m", provider: fakeProvider([
      () => ({ toolCalls: [{ type: "tool_use", id: "c1", name: "get_thing", input: {} }] }),
      () => ({ toolCalls: [{ type: "tool_use", id: "c2", name: "add_thing", input: { name: "Widget" } }] }),
      () => ({ text: "Add it?" }),
    ]) });
    const turn = await chatTurn(app, registry, maya, { text: "add a widget" });
    const traceId = turn.pending[0].traceId!;
    await confirmAction(app, registry, maya, turn.conversationId, turn.pending[0].id);
    const steps = await rows(sql`select kind, tool from core.trace_event where trace_id = ${traceId} order by seq`);
    expect(steps.map((s) => `${s.kind}${s.tool ? `:${s.tool}` : ""}`)).toEqual(["turn", "tool_call:get_thing", "pending:add_thing", "model_call", "decided:add_thing", "tool_call:add_thing"]);
    expect(await rows(sql`select count(*)::int as n from ai.call where trace_id = ${traceId}`)).toEqual([{ n: 1 }]);
    expect(await rows(sql`select action from core.audit_event where trace_id = ${traceId}`)).toEqual([{ action: "sample.thing.create" }]);

    const req = new Request("https://amax.test/api/mcp", { method: "POST",
      headers: { authorization: `Bearer ${await createApiToken(app, maya, { kind: "mcp", name: "test", days: 1 })}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "add_thing", arguments: { name: "Gadget" } } }) });
    expect((await (await handleMcp(req, { db: app, registry, base: "https://amax.test" })).json()).result.isError).toBeUndefined();
    const [mcp] = await rows(sql`select trace_id from core.trace_event where kind = 'mcp_call'`);
    expect(await rows(sql`select kind from core.trace_event where trace_id = ${mcp.trace_id} order by seq`)).toEqual([{ kind: "mcp_call" }, { kind: "tool_call" }]);
    expect(await rows(sql`select source from core.audit_event where trace_id = ${mcp.trace_id}`)).toEqual([{ source: "mcp" }]);

    const jobs = registryFrom([{ id: "sample", jobs: [{ name: "sample.nightly", run: async ({ tenantId }) => void (await addThing(contextFor.job(tenantId, "sample.nightly"), { name: "Nightly" })) }] }]);
    await withTenant(app, T, (tx) => scheduleJob(tx, { tenantId: T, name: "sample.nightly" }));
    expect((await runDueJobs(app, jobs)).jobs).toBe(1);
    const [job] = await rows(sql`select trace_id from core.trace_event where kind = 'job_run'`);
    expect(await rows(sql`select source from core.audit_event where trace_id = ${job.trace_id}`)).toEqual([{ source: "job" }]);
  });
});
