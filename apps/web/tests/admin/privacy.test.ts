import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { setGrants } from "@amax/auth";
import { chatPlatform, chatTurn, confirmAction } from "@amax/chat";
import { privacyGrants, setPrivacySources } from "@amax/core/privacy";
import { workflowsRetention } from "@amax/workflows/server";
import { adminDb, T } from "./fixture";

const PRIVACY_WRITES = ["open_privacy_request", "complete_privacy_request", "place_legal_hold", "release_legal_hold", "set_retention_period"];

describe.skipIf(!hasDb)("032 privacy tools (Postgres)", () => {
  let db: Awaited<ReturnType<typeof adminDb>>;
  beforeAll(async () => {
    db = await adminDb();
    setGrants([privacyGrants]);
    setPrivacySources([chatPlatform, { id: "workflows", retention: workflowsRetention }]);
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
});
