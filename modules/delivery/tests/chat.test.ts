import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
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

  it("idempotent decisions: errors after commit, cancel racing confirm, unknown ids, failures (review rounds 5 to 7)", async () => {
    const card = async (title: string) => {
      configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c", name: "create_proposal", input: { projectKey: "CON", title } }] }), () => ({ text: "ok" })]), db: app, model: "claude-haiku-5-5" });
      const turn = await chatTurn(app, registry, maya, { text: `add ${title} to CON` });
      return { convo: turn.conversationId, id: turn.pending[0].id };
    };
    const rows = async (title: string) => (await withTenant(app, T, (tx) => tx.execute(sql`select key from delivery.proposal where title = ${title}`))).map((r) => r.key);

    // The write commits, then the request dies before the card is updated: a retry returns the same
    // result and writes nothing more.
    const a = await card("Committed then lost");
    const lost = { ...registry, call: async (...args: Parameters<typeof registry.call>) => { await registry.call(...args); throw new Error("connection reset"); } } as typeof registry;
    await expect(confirmAction(app, lost, maya, a.convo, a.id)).rejects.toMatchObject({ retry: true });
    const again = await confirmAction(app, registry, maya, a.convo, a.id);
    expect(await rows("Committed then lost")).toEqual([(again.result as { key: string }).key]);

    // A cancel that lands while the confirm is on its way wins; the write never happens.
    const b = await card("Cancel wins");
    let entered!: () => void, release!: () => void;
    const inside = new Promise<void>((r) => { entered = r; });
    const gate = new Promise<void>((r) => { release = r; });
    const slow = { ...registry, call: async (...args: Parameters<typeof registry.call>) => { entered(); await gate; return registry.call(...args); } } as typeof registry;
    const confirming = confirmAction(app, slow, maya, b.convo, b.id);
    await inside;
    await cancelAction(app, maya, b.convo, b.id);
    release();
    await expect(confirming).rejects.toMatchObject({ decision: "cancelled" });
    expect(await rows("Cancel wins")).toEqual([]);

    // A cancel after the write ran (reply lost) is told it was done; an unknown id is an error;
    // cancelling twice is fine.
    const c = await card("Done then cancel");
    await expect(confirmAction(app, lost, maya, c.convo, c.id)).rejects.toMatchObject({ retry: true });
    await expect(cancelAction(app, maya, c.convo, c.id)).rejects.toMatchObject({ decision: "confirmed" });
    expect(await rows("Done then cancel")).toHaveLength(1);
    await expect(cancelAction(app, maya, c.convo, "not-an-action")).rejects.toMatchObject({ decision: null });
    await cancelAction(app, maya, b.convo, b.id);

    // Refused can't succeed later: the card closes as failed and a retry is told so.
    const d = await card("Refused");
    const { ForbiddenError } = await import("@amax/core/server");
    const refusing = { ...registry, call: async () => { throw new ForbiddenError("delivery:proposal:create", "delivery.proposal"); } } as unknown as typeof registry;
    await expect(confirmAction(app, refusing, maya, d.convo, d.id)).rejects.toMatchObject({ retry: false });
    await expect(confirmAction(app, registry, maya, d.convo, d.id)).rejects.toMatchObject({ decision: "failed" });
    expect(await rows("Refused")).toEqual([]);
  });

  it("concurrent creates in one project get distinct keys", async () => {
    const { createProposal } = await import("../server/services");
    const { ctxFor } = await import("../server/context");
    const out = await Promise.all(Array.from({ length: 6 }, (_, i) => createProposal(ctxFor(maya), { projectKey: "CON", title: `Parallel ${i}` })));
    expect(new Set(out.map((o) => o.key)).size).toBe(6);
  });
});
