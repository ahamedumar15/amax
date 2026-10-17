import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime, defineService } from "@amax/core/server";
import { z } from "zod";
import { applyViewAs, installAuthorizer, setGrants, viewerForUser, type Viewer, setViewerScopeResolvers } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry } from "@amax/mcp";
import { cancelAction, chatTurn, confirmAction, NotPendingError, type Intent } from "@amax/chat";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";
import { chatIntents } from "../chat";
import { managedProjectIds } from "../contracts";
import { ctxFor } from "../server/context";

const T = lumen.tenant.id;

describe.skipIf(!hasDb)("005 chat engine with delivery (Postgres, scripted model)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: Viewer, liam: Viewer;
  const registry = createRegistry([delivery]);
  const as = async (email: string) => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${email}`));
    const v = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
    return v;
  };
  const proposals = (title: string) => withTenant(app, T, (tx) => tx.execute(sql`select key from delivery.proposal where title = ${title}`));

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery]);
    // Managed projects come from the real resolver, as in the app (not planted on the viewer).
    setViewerScopeResolvers([delivery.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    await t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true)`;
    maya = applyViewAs(await as("maya@lumenlabs.test"), "PM");
    liam = await as("liam@lumenlabs.test");
  });
  afterAll(() => t?.drop());

  it("AC-3 a write becomes a confirm card; Add it runs the service with source chat", async () => {
    const provider = fakeProvider([
      () => ({ toolCalls: [{ type: "tool_use", id: "c1", name: "create_proposal", input: { projectKey: "CON", title: "Export invoices to PDF", estimateHours: 6 } }] }),
      () => ({ text: "I've prepared the proposal. Add it?" }),
    ]);
    configureAi({ provider, db: app, model: "claude-haiku-5-5" });
    const intent = chatIntents.find((i) => i.id === "delivery.new-proposal") as Intent;
    const turn = await chatTurn(app, registry, maya, { text: "Add export invoices to PDF to CON, about 6 hours", intent });
    expect(turn.pending).toHaveLength(1);
    expect(turn.pending[0]).toMatchObject({ tool: "create_proposal", input: { projectKey: "CON", title: "Export invoices to PDF" } });
    expect(turn.highlights.map((h) => h.field)).toEqual(["title", "projectKey"]);
    expect(provider.calls[0].system).toContain("required: projectKey, title");
    expect(await proposals("Export invoices to PDF")).toHaveLength(0);
    const { result } = await confirmAction(app, registry, maya, turn.conversationId, turn.pending[0].id);
    expect(result).toMatchObject({ key: "CON-018" });
    const [audit] = await withTenant(app, T, (tx) => tx.execute(sql`select source from core.audit_event where action = 'delivery.proposal.create' order by seq desc limit 1`));
    expect(audit.source).toBe("chat");
    await expect(confirmAction(app, registry, maya, turn.conversationId, turn.pending[0].id)).rejects.toMatchObject({ decision: "confirmed" });
  });

  it("Cancel writes nothing", async () => {
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c2", name: "create_proposal", input: { projectKey: "CON", title: "Never" } }] }), () => ({ text: "ok" })]), db: app, model: "claude-haiku-5-5" });
    const turn = await chatTurn(app, registry, maya, { text: "add Never to CON" });
    await cancelAction(app, maya, turn.conversationId, turn.pending[0].id);
    expect(await proposals("Never")).toHaveLength(0);
    // A late "Add it" for a cancelled card says so; an id this conversation never had is unknown (review round 4).
    await expect(confirmAction(app, registry, maya, turn.conversationId, turn.pending[0].id)).rejects.toMatchObject({ decision: "cancelled" });
    await expect(confirmAction(app, registry, maya, turn.conversationId, "not-an-action")).rejects.toMatchObject({ decision: null });
    expect(await proposals("Never")).toHaveLength(0);
  });

  it("AC-5 read tools run straight away and are reported; a role without access gets a refusal, not data", async () => {
    const provider = fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "r1", name: "list_projects", input: {} }] }), (req) => ({ text: String((req.messages.at(-1)!.content[0] as { content: string }).content).includes("Contoso") ? "Three projects." : "none" })]);
    configureAi({ provider, db: app, model: "claude-haiku-5-5" });
    const turn = await chatTurn(app, registry, maya, { text: "How many projects?" });
    expect(turn).toMatchObject({ reply: "Three projects.", toolsRun: ["list_projects"], pending: [] });
    const refused = fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "r2", name: "list_projects", input: {} }] }), (req) => ({ text: JSON.stringify(req.messages.at(-1)!.content[0]) })]);
    configureAi({ provider: refused, db: app, model: "claude-haiku-5-5" });
    expect(refused.calls).toHaveLength(0);
    const out = await chatTurn(app, registry, liam, { text: "list projects" });
    expect(out.reply).toContain("invalid call to list_projects");
    expect(out.reply).not.toContain("Contoso");
    expect(refused.calls[0].tools?.map((x) => x.name)).toEqual(["whoami", "search"]);
  });

  it("AC-4 pins are fetched with the user's permissions and sent as quoted data", async () => {
    const provider = fakeProvider(() => ({ text: "Fleet Tracker is at risk." }));
    configureAi({ provider, db: app, model: "claude-haiku-5-5" });
    await chatTurn(app, registry, maya, { text: "Why is this at risk?", pins: [{ label: "Fleet Tracker", tool: "get_project", args: { key: "FLT" } }] });
    const sent = JSON.stringify(provider.calls[0].messages[0]);
    expect(sent).toContain('<data label=\\"Fleet Tracker\\">');
    expect(sent).toContain("Wide World Importers");
  });

  it("conversations continue and stay private to their user", async () => {
    configureAi({ provider: fakeProvider(() => ({ text: "hi" })), db: app, model: "claude-haiku-5-5" });
    const a = await chatTurn(app, registry, maya, { text: "hello" });
    const b = await chatTurn(app, registry, maya, { conversationId: a.conversationId, text: "again" });
    expect(b.conversationId).toBe(a.conversationId);
    await expect(chatTurn(app, registry, liam, { conversationId: a.conversationId, text: "peek" })).rejects.toThrow(/not found/);
  });
});

describe.skipIf(!hasDb)("races (review round 1)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let maya: Viewer;
  const registry = createRegistry([delivery]);
  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery]);
    setViewerScopeResolvers([delivery.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    await t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true)`;
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = 'maya@lumenlabs.test'`));
    maya = applyViewAs((await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!, "PM");
  });
  afterAll(() => t?.drop());

  it.each([2, 5])("%i concurrent confirms of one card run the write once and all get its result", async (n) => {
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c", name: "create_proposal", input: { projectKey: "CON", title: `Race ${n}` } }] }), () => ({ text: "ok" })]), db: app, model: "claude-haiku-5-5" });
    const turn = await chatTurn(app, registry, maya, { text: `add Race ${n} to CON` });
    const results = await Promise.allSettled(Array.from({ length: n }, () => confirmAction(app, registry, maya, turn.conversationId, turn.pending[0].id)));
    const rows = await withTenant(app, T, (tx) => tx.execute(sql`select key from delivery.proposal where title = ${`Race ${n}`}`));
    expect(rows).toHaveLength(1);
    // Each click either got the one result or was told the card was already confirmed.
    for (const r of results) {
      if (r.status === "fulfilled") expect(r.value.result).toMatchObject({ key: rows[0].key });
      else expect(r.reason).toMatchObject({ decision: "confirmed" });
    }
  });

  it("a confirm during a running turn stays confirmed: the turn doesn't bring the card back (review round 2)", async () => {
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c", name: "create_proposal", input: { projectKey: "CON", title: "Mid-turn" } }] }), () => ({ text: "ok" })]), db: app, model: "claude-haiku-5-5" });
    const first = await chatTurn(app, registry, maya, { text: "add Mid-turn to CON" });
    // The second turn's model call waits until the card has been confirmed.
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const inner = fakeProvider(() => ({ text: "anything else?" }));
    configureAi({ provider: { name: "gated", call: async (req) => { await gate; return inner.call(req); } }, db: app, model: "claude-haiku-5-5" });
    const second = chatTurn(app, registry, maya, { text: "thanks", conversationId: first.conversationId });
    await confirmAction(app, registry, maya, first.conversationId, first.pending[0].id);
    release();
    await second;
    // A typed refusal, which the page shows as "already handled", not "cancelled" (review round 3).
    await expect(confirmAction(app, registry, maya, first.conversationId, first.pending[0].id)).rejects.toBeInstanceOf(NotPendingError);
    const rows = await withTenant(app, T, (tx) => tx.execute(sql`select key from delivery.proposal where title = 'Mid-turn'`));
    expect(rows).toHaveLength(1);
    const [c] = await withTenant(app, T, (tx) => tx.execute(sql`select messages from chat.conversation where id = ${first.conversationId}`));
    expect(JSON.stringify(c.messages)).toContain('I confirmed \\"');
  });

  describe("exactly-once confirm (review rounds 5 to 8)", () => {
    // A test module: a write whose transaction can be held open, one that bypasses the service
    // pipeline, and one that makes two writes.
    let hold: { entered: () => void; gate: Promise<void> } | null = null;
    const insertProposal = async (tx: Parameters<Parameters<typeof withTenant>[2]>[0], tenantId: string, title: string) => {
      const [row] = await tx.execute(sql`insert into delivery.proposal (tenant_id, project_id, key, title)
        select ${tenantId}, id, 'CON-T' || substr(md5(random()::text), 1, 6), ${title} from delivery.project where key = 'CON' returning id, key`);
      return row as { id: string; key: string };
    };
    const testWrite = defineService({
      name: "test.write", action: "delivery:proposal:create", resource: "delivery.proposal", input: z.object({ title: z.string() }),
      async run(tx, input, ctx) {
        const row = await insertProposal(tx, ctx.tenantId, input.title);
        if (hold) { hold.entered(); await hold.gate; } // the write's transaction is open here
        return { result: { key: row.key }, resourceId: row.id, after: input };
      },
    });
    const tool = (name: string, run: (viewer: Viewer, input: { title: string }) => Promise<unknown>) =>
      ({ name, description: `${name}.`, input: z.object({ title: z.string() }), permission: "", scope: "write" as const, run });
    const testModule = { id: "t", mcpTools: [
      tool("test_write", (v, i) => testWrite(ctxFor(v, "chat"), i)),
      tool("raw_write", (v, i) => withTenant(app, T, (tx) => insertProposal(tx, v.tenantId, i.title))),
      tool("double_write", async (v, i) => { await testWrite(ctxFor(v, "chat"), i); return testWrite(ctxFor(v, "chat"), { title: `${i.title} 2` }); }),
    ] };
    const reg = createRegistry([delivery, testModule as never]);
    const card = async (name: string, title: string) => {
      configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c", name, input: { title } }] }), () => ({ text: "ok" })]), db: app, model: "claude-haiku-5-5" });
      const turn = await chatTurn(app, reg, maya, { text: title });
      return { convo: turn.conversationId, id: turn.pending[0].id };
    };
    const rows = async (title: string) => (await withTenant(app, T, (tx) => tx.execute(sql`select key from delivery.proposal where title = ${title}`))).map((r) => r.key);
    const holdNext = () => {
      let entered!: () => void, release!: () => void;
      const inside = new Promise<void>((r) => { entered = r; });
      hold = { entered, gate: new Promise<void>((r) => { release = r; }) };
      return { inside, release: () => { release(); hold = null; } };
    };

    it("an error after the write committed is reported as done, not retried", async () => {
      const a = await card("test_write", "Committed then error");
      const lost = { ...reg, call: async (...args: Parameters<typeof reg.call>) => { await reg.call(...args); throw new Error("connection reset"); } } as typeof reg;
      const r = await confirmAction(app, lost, maya, a.convo, a.id);
      expect(await rows("Committed then error")).toEqual([(r.result as { key: string }).key]);
    });

    it("a retry after a committed write returns it first, even where a fresh attempt would be refused", async () => {
      const { ForbiddenError } = await import("@amax/core/server");
      const refusing = { ...reg, call: async () => { throw new ForbiddenError("x", "y"); } } as unknown as typeof reg;
      const b = await card("test_write", "Settle lost");
      const r1 = await confirmAction(app, reg, maya, b.convo, b.id);
      await withTenant(app, T, (tx) => tx.execute(sql`update chat.conversation set pending = pending || ${JSON.stringify([{ id: b.id, tool: "test_write", title: "Settle lost", input: { title: "Settle lost" }, fields: ["title"] }])}::jsonb, decided = decided - ${b.id}::text where id = ${b.convo}`));
      const r2 = await confirmAction(app, refusing, maya, b.convo, b.id);
      expect(r2.result).toMatchObject({ replayed: true, key: (r1.result as { key: string }).key });
      expect(await rows("Settle lost")).toHaveLength(1);
    });

    it("a keyed service call returns the stored outcome before authorize and validation run (round 8)", async () => {
      const { withIdempotency } = await import("@amax/core/server");
      const key = `test:${Math.random()}`;
      const first = await withIdempotency(key, () => testWrite(ctxFor(maya, "chat"), { title: "Keyed first" }));
      expect(first).toMatchObject({ ok: true, writes: 1 });
      const nobody = { tenantId: T, actor: { id: "user:nobody", kind: "user" as const, roles: [] }, source: "chat" as const };
      const again = await withIdempotency(key, () => testWrite(nobody, { title: 42 } as never));
      expect(again).toMatchObject({ ok: true, value: { replayed: true, key: (first as { value: { key: string } }).value.key } });
      // Without the key the same call is refused.
      await expect(testWrite(nobody, { title: "x" })).rejects.toThrow(/forbidden/);
      expect(await rows("Keyed first")).toHaveLength(1);
    });

    it("a cancel arriving while the write's transaction is open waits, then is told it was done", async () => {
      const a = await card("test_write", "Cancel during write");
      const h = holdNext();
      const confirming = confirmAction(app, reg, maya, a.convo, a.id);
      await h.inside;
      const cancelling = cancelAction(app, maya, a.convo, a.id);
      await new Promise((r) => setTimeout(r, 200)); // the cancel is now blocked on the key
      h.release();
      await confirming;
      await expect(cancelling).rejects.toMatchObject({ decision: "confirmed" });
      expect(await rows("Cancel during write")).toHaveLength(1);
      const [c] = await withTenant(app, T, (tx) => tx.execute(sql`select decided from chat.conversation where id = ${a.convo}`));
      expect((c.decided as Record<string, string>)[a.id]).toBe("confirmed");
    });

    it("a cancel before the write starts wins; the write never happens", async () => {
      const a = await card("test_write", "Cancel first");
      let entered!: () => void, release!: () => void;
      const inside = new Promise<void>((r) => { entered = r; });
      const gate = new Promise<void>((r) => { release = r; });
      const slow = { ...reg, call: async (...args: Parameters<typeof reg.call>) => { entered(); await gate; return reg.call(...args); } } as typeof reg;
      const confirming = confirmAction(app, slow, maya, a.convo, a.id);
      await inside;
      await cancelAction(app, maya, a.convo, a.id);
      release();
      await expect(confirming).rejects.toMatchObject({ decision: "cancelled" });
      expect(await rows("Cancel first")).toEqual([]);
    });

    it.each([
      ["a write around the service pipeline", "raw_write", "Raw write"],
      ["two writes", "double_write", "Two writes"],
    ])("%s is an unknown outcome: the card closes and asks to check, no retry", async (_n, name, title) => {
      const a = await card(name, title);
      await expect(confirmAction(app, reg, maya, a.convo, a.id)).rejects.toMatchObject({ kind: "unknown" });
      await expect(confirmAction(app, reg, maya, a.convo, a.id)).rejects.toMatchObject({ decision: "unknown" });
    });

    it("refused can't succeed later: closed as failed; unknown ids are errors; cancelling twice is fine", async () => {
      const a = await card("test_write", "Refused");
      const { ForbiddenError } = await import("@amax/core/server");
      const refusing = { ...reg, call: async () => { throw new ForbiddenError("x", "y"); } } as unknown as typeof reg;
      await expect(confirmAction(app, refusing, maya, a.convo, a.id)).rejects.toMatchObject({ kind: "failed" });
      await expect(confirmAction(app, reg, maya, a.convo, a.id)).rejects.toMatchObject({ decision: "failed" });
      await expect(cancelAction(app, maya, a.convo, "not-an-action")).rejects.toMatchObject({ decision: null });
      const b = await card("test_write", "Cancel twice");
      await cancelAction(app, maya, b.convo, b.id);
      await expect(cancelAction(app, maya, b.convo, b.id)).resolves.toBeUndefined();
      expect(await rows("Refused")).toEqual([]);
    });

    it("a card expires before its record can be pruned, and notes keep only the record key (review round 9)", async () => {
      const { CARD_DAYS } = await import("@amax/chat");
      const a = await card("test_write", "Expires");
      const old = new Date(Date.now() - (CARD_DAYS + 1) * 86_400_000).toISOString();
      await withTenant(app, T, (tx) => tx.execute(sql`update chat.conversation set pending = (select jsonb_agg(p || jsonb_build_object('createdAt', ${old}::text)) from jsonb_array_elements(pending) p) where id = ${a.convo}`));
      await expect(confirmAction(app, reg, maya, a.convo, a.id)).rejects.toMatchObject({ decision: "expired" });
      expect(await rows("Expires")).toEqual([]);
      const b = await card("test_write", "Note shape");
      const r = await confirmAction(app, reg, maya, b.convo, b.id);
      const [c] = await withTenant(app, T, (tx) => tx.execute(sql`select messages->-1 as last from chat.conversation where id = ${b.convo}`));
      expect(JSON.stringify(c.last)).toContain(`Record: ${(r.result as { key: string }).key}.`);
      expect(JSON.stringify(c.last)).not.toContain("Result:");
    });

    it("the stored record is a replay record only, and old records are pruned", async () => {
      const a = await card("test_write", "Replay only");
      await confirmAction(app, reg, maya, a.convo, a.id);
      const [rec] = await t.owner`select outcome from core.idempotency where key = ${`chat:${a.id}`}`;
      expect(Object.keys(rec.outcome.done).sort()).toEqual(["key", "replayed", "resourceId"]);
      const { pruneKeysJob, KEY_DAYS } = await import("@amax/core/server");
      await t.owner`update core.idempotency set created_at = now() - make_interval(days => ${KEY_DAYS + 1}) where key = ${`chat:${a.id}`}`;
      await withTenant(app, T, (tx) => pruneKeysJob.run({ tx, tenantId: T } as never));
      expect(await t.owner`select 1 from core.idempotency where key = ${`chat:${a.id}`}`).toHaveLength(0);
    });
  });

  it("concurrent creates in one project get distinct keys", async () => {
    const { createProposal } = await import("../server/services");
    const { ctxFor } = await import("../server/context");
    const out = await Promise.all(Array.from({ length: 6 }, (_, i) => createProposal(ctxFor(maya), { projectKey: "CON", title: `Parallel ${i}` })));
    expect(new Set(out.map((o) => o.key)).size).toBe(6);
  });
});
