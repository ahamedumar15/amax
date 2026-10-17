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
import { cancelAction, chatTurn, confirmAction, type Intent } from "@amax/chat";
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
    await expect(confirmAction(app, registry, maya, turn.conversationId, turn.pending[0].id)).rejects.toThrow(/no longer pending/);
  });

  it("Cancel writes nothing", async () => {
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c2", name: "create_proposal", input: { projectKey: "CON", title: "Never" } }] }), () => ({ text: "ok" })]), db: app, model: "claude-haiku-5-5" });
    const turn = await chatTurn(app, registry, maya, { text: "add Never to CON" });
    await cancelAction(app, maya, turn.conversationId, turn.pending[0].id);
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
