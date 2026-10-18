import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime, defineService } from "@amax/core/server";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry } from "@amax/mcp";
import { cancelAction, chatTurn, confirmAction } from "@amax/chat";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";
import { ctxFor } from "../server/context";

const T = lumen.tenant.id;
type Tx = Parameters<Parameters<typeof withTenant>[2]>[0];

// 043: the chat confirm against real failures, with the tools a module could get wrong.
describe.skipIf(!hasDb)("043 chat confirm: one declared service, fail closed", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: Viewer, liam: Viewer;
  let gate: { entered: () => void; open: Promise<void> } | null = null;

  const insert = async (tx: Tx, tenantId: string, title: string) => {
    const [row] = await tx.execute(sql`insert into delivery.proposal (tenant_id, project_id, key, title)
      select ${tenantId}, id, 'CON-U' || substr(md5(random()::text), 1, 6), ${title} from delivery.project where key = 'CON' returning id, key`);
    return row as { id: string; key: string };
  };
  const write = defineService({
    name: "test.write", action: "delivery:proposal:create", resource: "delivery.proposal", input: z.object({ title: z.string().min(2) }),
    async run(tx, input, ctx) {
      const row = await insert(tx, ctx.tenantId, input.title);
      return { result: { key: row.key }, resourceId: row.id, after: input };
    },
  });
  const raw = (v: Viewer, title: string) => withTenant(app, T, (tx) => insert(tx, v.tenantId, title));
  const tool = (name: string, run: (v: Viewer, i: { title: string }) => Promise<unknown>, title: z.ZodString = z.string()) =>
    ({ name, description: `${name}.`, input: z.object({ title }), permission: "", scope: "write" as const, service: write, run });
  const tools = [
    tool("test_write", (v, i) => write(ctxFor(v, "chat"), i)),
    tool("raw_then_throw", async (v, i) => { await raw(v, i.title); throw Object.assign(new Error("reset"), { code: "ECONNRESET" }); }),
    tool("held_raw", async (v, i) => { const r = await raw(v, i.title); gate?.entered(); await gate?.open; return r; }),
    tool("as_liam", (_v, i) => write(ctxFor(liam, "chat"), i)),
    tool("bad_input", (v) => write(ctxFor(v, "chat"), { title: "x" })),
  ];
  const reg = createRegistry([delivery, { id: "t", mcpTools: tools } as never]);
  const strict = createRegistry([delivery, { id: "t", mcpTools: [tool("test_write", (v, i) => write(ctxFor(v, "chat"), i), z.string().min(500))] } as never]);

  const card = async (name: string, title: string) => {
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c", name, input: { title } }] }), () => ({ text: "ok" })]), db: app, model: "claude-haiku-5-5" });
    const turn = await chatTurn(app, reg, maya, { text: title });
    return { convo: turn.conversationId, id: turn.pending[0].id };
  };
  const rows = async (title: string) => (await withTenant(app, T, (tx) => tx.execute(sql`select key from delivery.proposal where title = ${title}`))).length;
  const decided = async (c: { convo: string; id: string }) => {
    const [row] = await withTenant(app, T, (tx) => tx.execute(sql`select decided from chat.conversation where id = ${c.convo}`));
    return (row.decided as Record<string, string>)[c.id];
  };
  const as = async (email: string) => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${email}`));
    return (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
  };

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery]);
    setViewerScopeResolvers([delivery.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    await t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true)`;
    maya = applyViewAs(await as("maya@lumenlabs.test"), "PM");
    liam = await as("liam@lumenlabs.test");
  });
  afterAll(() => t?.drop());

  it("AC-1 a write tool without a declared service never becomes a card", async () => {
    const bare = createRegistry([delivery]);
    const undeclared = { ...bare, toolsFor: (v: Viewer) => bare.toolsFor(v).map((x) => (x.name === "create_proposal" ? { ...x, service: undefined } : x)) } as typeof bare;
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c", name: "create_proposal", input: { projectKey: "CON", title: "Undeclared" } }] }), () => ({ text: "ok" })]), db: app, model: "claude-haiku-5-5" });
    expect((await chatTurn(app, undeclared, maya, { text: "add Undeclared to CON" })).pending).toEqual([]);
    expect(() => createRegistry([{ id: "t", mcpTools: [{ ...tools[0], service: undefined }] } as never])).toThrow(/declares no service/);
  });

  it("AC-3 a write around the pipeline that then throws a transient error closes as unknown, never offered a retry", async () => {
    const a = await card("raw_then_throw", "Raw then reset");
    await expect(confirmAction(app, reg, maya, a.convo, a.id)).rejects.toMatchObject({ kind: "unknown" });
    expect(await decided(a)).toBe("unknown");
    expect(await rows("Raw then reset")).toBe(1);
  });

  it("AC-3 a cancel that loses to a write recorded as unknown is overwritten with unknown", async () => {
    const a = await card("held_raw", "Raw against cancel");
    let entered!: () => void, open!: () => void;
    const inside = new Promise<void>((r) => { entered = r; });
    gate = { entered, open: new Promise<void>((r) => { open = r; }) };
    const confirming = confirmAction(app, reg, maya, a.convo, a.id);
    await inside;
    await cancelAction(app, maya, a.convo, a.id);
    expect(await decided(a)).toBe("cancelled");
    open();
    gate = null;
    await expect(confirming).rejects.toMatchObject({ kind: "unknown" });
    expect(await decided(a)).toBe("unknown");
    expect(await rows("Raw against cancel")).toBe(1);
  });

  it("AC-6 a settle that fails after the service committed: the retry reports it done and writes nothing more", async () => {
    const a = await card("test_write", "Settle fails");
    await t.owner.unsafe(`create function chat.no_settle() returns trigger language plpgsql as $$ begin raise exception 'settle down'; end $$;
      create trigger no_settle before update on chat.conversation for each row execute function chat.no_settle()`);
    const failed = await confirmAction(app, reg, maya, a.convo, a.id).catch((e: Error) => e);
    await t.owner.unsafe(`drop trigger no_settle on chat.conversation; drop function chat.no_settle()`);
    expect((failed as Error).cause).toMatchObject({ message: "settle down" });
    expect(await rows("Settle fails")).toBe(1);
    expect((await confirmAction(app, reg, maya, a.convo, a.id)).result).toMatchObject({ replayed: true });
    expect(await decided(a)).toBe("confirmed");
    expect(await rows("Settle fails")).toBe(1);
  });

  it.each([
    ["authorize", "as_liam", reg],
    ["validation", "bad_input", reg],
    ["the registry's pre-check", "test_write", strict],
  ] as const)("AC-6 a refusal by %s closes the card as failed and writes nothing", async (_kind, name, registry) => {
    const title = `Refused by ${name}`;
    const a = await card(name, title);
    await expect(confirmAction(app, registry, maya, a.convo, a.id)).rejects.toMatchObject({ kind: "failed" });
    expect(await decided(a)).toBe("failed");
    expect(await rows(title)).toBe(0);
  });
});
