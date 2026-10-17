import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { chatTurn, confirmAction } from "@amax/chat";
import { putSecret } from "@amax/core/secrets";
import { contextFor } from "@amax/core/server";
import { adminDb, AU, T } from "./fixture";

const WRITES = ["put_secret", "rotate_secret", "revoke_secret", "revoke_mcp_client", "set_ai_policy", "control_workflow_run", "set_schedule_enabled", "set_entity_zone"];

describe.skipIf(!hasDb)("047 admin tools (Postgres)", () => {
  let db: Awaited<ReturnType<typeof adminDb>>;
  beforeAll(async () => {
    db = await adminDb();
    await putSecret(contextFor.job(T, "seed"), { connector: "github", value: "test-seed-github-value" });
    const [u] = await db.t.owner`select id from auth.user where email = 'nimal@lumenlabs.test'`;
    await db.t.owner`insert into auth.oauth_client (id, name, redirect_uris) values ('c-e2e', 'Fictional client', '{http://localhost/cb}')`;
    await db.t.owner`insert into auth.api_token (tenant_id, user_id, kind, name, token_hash, expires_at, client_id) values (${T}, ${u.id}, 'mcp', 'mcp', 'h1', now() + interval '1 day', 'c-e2e')`;
  });
  afterAll(() => db?.t.drop());

  it("AC2 each write is Admin only and runs only after chat's confirm card", async () => {
    const [maya, nimal] = [await db.as("maya"), await db.as("nimal")];
    expect(db.registry.toolsFor(nimal).map((t) => t.name).filter((n) => WRITES.includes(n))).toEqual([]);
    for (const name of WRITES) await expect(db.registry.call(nimal, name, {}, { source: "mcp" }), name).rejects.toThrow(/forbidden/);
    const runId = await db.engine.start(T, "core.audit-check", null, { startedBy: "test" });
    const [nimalId] = await db.t.owner`select id from auth.user where email = 'nimal@lumenlabs.test'`;
    const cases: [string, Record<string, unknown>, string | null][] = [
      ["put_secret", { connector: "xero" }, "the value"], ["rotate_secret", { connector: "github" }, "the new value"], ["revoke_secret", { connector: "xero", reason: "unused" }, null],
      ["revoke_mcp_client", { clientId: "c-e2e", userId: nimalId.id }, null], ["set_ai_policy", { allowedClasses: ["pay"] }, null],
      ["control_workflow_run", { runId, action: "pause" }, null], ["set_schedule_enabled", { schedule: "Audit chain check", enabled: false }, null],
      ["set_entity_zone", { entity: AU.name, timezone: "Australia/Sydney" }, null],
    ];
    for (const [name, input, secret] of cases) {
      configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name, input }] }), () => ({ text: "Confirm?" })]), db: db.app, model: "claude-haiku-5-5" });
      const turn = await chatTurn(db.app, db.registry, maya, { text: `please ${name}` });
      expect(turn.pending.map((p) => [p.tool, p.secret?.label.toLowerCase() ?? null])).toEqual([[name, secret?.replace("the ", "") ?? null]]);
      expect((await db.t.owner`select count(*)::int as n from core.audit_event where source = 'chat'`)[0].n, `${name} wrote before confirm`).toBe(WRITES.indexOf(name));
      await confirmAction(db.app, db.registry, maya, turn.conversationId, turn.pending[0].id, secret ? { secret: `test-${name}-value` } : {});
    }
  }, 60_000);

  it("AC3 every write went through defineService: audited as the person via chat, with an event", async () => {
    const audit = await db.t.owner`select action, actor, source from core.audit_event where source = 'chat' order by seq`;
    const maya = await db.as("maya");
    expect(audit.map((a) => a.action)).toEqual(["secrets.credential.put", "secrets.credential.put", "secrets.credential.revoke", "auth.oauth.client_revoked", "ai.policy.update", "workflows.run.pause", "workflows.schedule.toggle", "workflows.entity_zone.set"]);
    expect(new Set(audit.map((a) => `${a.actor} ${a.source}`))).toEqual(new Set([`user:${maya.userId} chat`]));
    const events = (await db.t.owner`select name from core.event`).map((e) => e.name);
    for (const e of ["secrets.credential.added", "secrets.credential.rotated", "secrets.credential.revoked", "auth.oauth.client_revoked", "ai.policy.updated", "workflows.run.paused", "workflows.schedule.disabled", "workflows.entity_zone.set"]) expect(events).toContain(e);
  });

  it("AC6 set_entity_zone schedules the entity's per-entity work in its new zone", async () => {
    const [s] = await db.t.owner`select timezone, next_run_at from workflows.schedule where legal_entity_id = ${AU.id}`;
    expect(s).toMatchObject({ timezone: "Australia/Sydney", next_run_at: null });
  });
});
