import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { setGrants } from "@amax/auth";
import { chatTurn, confirmAction } from "@amax/chat";
import { previewPurge, privacyGrants, setPrivacySources } from "@amax/core/privacy";
import { withTenant } from "@amax/db";
import { PLATFORM_PRIVACY_SOURCES, privacySources } from "../../lib/privacy-sources";
import { apiPlatform, webhookEvents } from "@amax/api/module";
import { installed } from "../../lib/registry";
import { adminDb, T } from "./fixture";

const PRIVACY_WRITES = ["open_privacy_request", "complete_privacy_request", "place_legal_hold", "release_legal_hold", "set_retention_period"];

describe.skipIf(!hasDb)("032 privacy tools (Postgres)", () => {
  let db: Awaited<ReturnType<typeof adminDb>>;
  beforeAll(async () => {
    db = await adminDb();
    setGrants([privacyGrants]);
    setPrivacySources(PLATFORM_PRIVACY_SOURCES);
    const [u] = await db.t.owner`insert into auth.user (tenant_id, email, name) values (${T}, 'hira@lumenlabs.test', 'Hira Test (fictional HR)') returning id`;
    await db.t.owner`insert into auth.role_assignment (tenant_id, user_id, role, source) values (${T}, ${u.id}, 'HR', 'manual')`;
  });
  afterAll(() => db?.t.drop());

  const viaChat = async (key: string, name: string, input: Record<string, unknown>) => {
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name, input }] }), () => ({ text: "Confirm?" })]), db: db.app, model: "claude-haiku-5-5" });
    const viewer = await db.as(key);
    const turn = await chatTurn(db.app, db.registry, viewer, { text: `please ${name}` });
    expect(turn.pending.map((p) => p.tool)).toEqual([name]);
    return () => confirmAction(db.app, db.registry, viewer, turn.conversationId, turn.pending[0].id, {});
  };

  it("AC-4 requests open and complete only through chat's confirm, HR and Admin only, and the opener can't complete their own", async () => {
    const nimal = await db.as("nimal");
    expect(db.registry.toolsFor(nimal).map((t) => t.name).filter((n) => PRIVACY_WRITES.includes(n) || n === "retention_overview")).toEqual([]);
    expect(db.registry.toolsFor(await db.as("hira")).map((t) => t.name)).toEqual(expect.arrayContaining([...PRIVACY_WRITES, "retention_overview", "get_privacy_request"]));
    const open = await viaChat("maya", "open_privacy_request", { kind: "erasure", person: "rizwan@lumenlabs.test" });
    expect((await db.t.owner`select count(*)::int as n from privacy.request`)[0].n).toBe(0);
    await open();
    const [req] = await db.t.owner`select id, status, inventory from privacy.request`;
    expect(req.status).toBe("open");
    await expect(db.registry.call(await db.as("maya"), "complete_privacy_request", { id: req.id }, { source: "chat" })).rejects.toThrow(/a different person must complete this request/);
    const done = await viaChat("hira", "complete_privacy_request", { id: req.id });
    expect((await db.t.owner`select status from privacy.request`)[0].status).toBe("open");
    await done();
    expect((await db.t.owner`select status, subject_label from privacy.request`)[0]).toEqual({ status: "completed", subject_label: "Erased person" });
    const audit = await db.t.owner`select action, actor, source from core.audit_event where action like 'privacy.%' order by seq`;
    expect(audit.map((a) => `${a.action} ${a.source}`)).toEqual(["privacy.request.open chat", "privacy.request.complete chat"]);
    const pinned = await db.registry.call(await db.as("hira"), "get_privacy_request", { id: req.id }, { source: "chat", scopes: ["read"] });
    expect(pinned).toMatchObject({ id: req.id, status: "completed" });
  }, 60_000);

  // Review 058 B10: requests open and complete only on chat's confirm card, never over MCP or the API,
  // where a credential or agent could act with no person confirming.
  it.each([
    ["open_privacy_request", "mcp"], ["open_privacy_request", "api"], ["complete_privacy_request", "mcp"], ["complete_privacy_request", "api"],
  ] as const)("058 %s over %s is refused", async (tool, source) => {
    const args = tool === "open_privacy_request" ? { kind: "access", person: "maya@lumenlabs.test" } : { id: "00000000-0000-4000-8000-000000000058" };
    const before = (await db.t.owner`select count(*)::int as n from privacy.request`)[0].n;
    await expect(db.registry.call(await db.as("hira"), tool, args, { source })).rejects.toThrow(/only on amax chat's confirm card/);
    expect((await db.t.owner`select count(*)::int as n from privacy.request`)[0].n).toBe(before);
  }, 60_000);
});

// Review 058 B4: one list of the platform's retention for the app, the seed and the tests, so the API's
// logs reach the purge, legal holds and the screen; nothing deletes them on the side.
describe("058 every platform retention rule is a privacy source", () => {
  it.each(["chat.conversation", "workflows.run", "workflows.step", "api.rate_limited", "api.inbound", "api.delivery"])("%s is in the purge's catalog", (table) => {
    expect(privacySources([]).flatMap((s) => s.retention ?? []).map((r) => r.table)).toContain(table);
  });
  it("the API platform runs no prune job of its own", () => {
    expect((apiPlatform([], async () => { throw new Error("unused"); }) as { jobs?: unknown[] }).jobs ?? []).toEqual([]);
  });
});

// Review 058: every event an installed module emits declares its payload, so outgoing webhooks know
// what may leave amax; anything undeclared is masked.
describe("058 every emitted event declares its payload", () => {
  it.each(installed.flatMap((m) => (m.events?.emits ?? []).map((e) => [m.id, e] as const)))("%s emits %s with a declaration", (_, event) => {
    expect(webhookEvents(installed).find((e) => e.name === event)?.fields).toBeTruthy();
  });
});

// Review 058 (rounds 1 and 2): chat is kept 90 days after its last message, not 90 idle days plus 90.
describe.skipIf(!hasDb)("058 chat conversations are due 90 days after the last message (Postgres)", () => {
  let db: Awaited<ReturnType<typeof adminDb>>;
  beforeAll(async () => {
    db = await adminDb();
    setPrivacySources(PLATFORM_PRIVACY_SOURCES);
  });
  afterAll(() => db?.t.drop());

  it.each([[89, 0], [91, 1], [179, 1]])("a conversation last updated %i days ago: %i due", async (days, due) => {
    await db.t.owner`delete from chat.conversation`;
    await db.t.owner`insert into chat.conversation (tenant_id, user_id, updated_at) select ${T}, id, now() - make_interval(days => ${days}) from auth.user where email = 'maya@lumenlabs.test'`;
    const out = await withTenant(db.app, T, (tx) => previewPurge(tx));
    expect(out.counts.find((c) => c.rule === "chat.conversation.messages")?.n).toBe(due);
  }, 60_000);
});

