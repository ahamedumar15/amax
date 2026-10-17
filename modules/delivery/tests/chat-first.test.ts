import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { applyViewAs, installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { createRegistry } from "@amax/mcp";
import { chatTurn, confirmAction } from "@amax/chat";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";

const T = lumen.tenant.id;
const root = join(import.meta.dirname, "..");

describe("054 AC-1 delivery screens have no forms or direct writes", () => {
  it("AC1 no form, dialog or server action in the delivery UI", () => {
    expect(existsSync(join(root, "actions.ts"))).toBe(false);
    for (const f of readdirSync(join(root, "ui")).filter((n) => n.endsWith(".tsx"))) {
      const src = readFileSync(join(root, "ui", f), "utf8");
      expect([f, /<form|<dialog|"use server"|from "\.\.\/actions"|from "\.\.\/server\/services"/.test(src)]).toEqual([f, false]);
    }
  });
});

describe.skipIf(!hasDb)("054 board and release writes wait for chat's confirm (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  const registry = createRegistry([delivery]);
  const q = (query: ReturnType<typeof sql>) => withTenant(app, T, (tx) => tx.execute(query));
  const as = async (key: string) => {
    const [u] = await q(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`);
    const v = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
    return key === "maya" ? applyViewAs(v, "PM") : v;
  };
  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery]);
    setViewerScopeResolvers([delivery.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    await t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
  }, 60_000);
  afterAll(() => t?.drop());

  const deployments = sql`select count(*)::text as v from delivery.deployment d join delivery.release r on r.id = d.release_id where r.version = 'v2.4.0'`;
  it.each([
    ["move_proposal", "maya", { key: "CON-017", to: "building" }, sql`select phase as v from delivery.proposal where key = 'CON-017'`, "delivery.proposal.move"],
    ["record_deployment", "sahan", { projectKey: "CON", version: "v2.4.0", environment: "UAT" }, deployments, "delivery.deployment.record"],
  ] as const)("AC2 %s becomes a confirm card and writes only once confirmed, audited as chat", async (name, who, args, probe, action) => {
    const viewer = await as(who);
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name, input: args }] }), () => ({ text: "Confirm?" })]), db: app, model: "claude-haiku-5-5" });
    const [before] = await q(probe);
    const turn = await chatTurn(app, registry, viewer, { text: `please ${name}` });
    expect(turn.pending.map((p) => p.tool)).toEqual([name]);
    expect((await q(probe))[0].v).toBe(before.v);
    await confirmAction(app, registry, viewer, turn.conversationId, turn.pending[0].id);
    expect((await q(probe))[0].v).not.toBe(before.v);
    const [audit] = await q(sql`select source from core.audit_event where action = ${action} order by seq desc limit 1`);
    expect(audit.source).toBe("chat");
  }, 60_000);

  // 057: a row pin resolves to that row's record, never the whole list.
  it("057 get_proposal, get_environment and get_deployment resolve one record, and null when it isn't there", async () => {
    const sahan = await as("sahan");
    const call = (tool: string, args: Record<string, unknown>) => registry.call(sahan, tool, args, { source: "chat" });
    const [dep] = await q(sql`select d.id from delivery.deployment d join delivery.release r on r.id = d.release_id join delivery.project p on p.id = r.project_id where p.key = 'CON' and r.version = 'v2.3.0' limit 1`);
    const cases: [string, Record<string, unknown>, Record<string, unknown> | null][] = [
      ["get_proposal", { key: "CON-017" }, { key: "CON-017", projectKey: "CON" }],
      ["get_proposal", { key: "CON-999" }, null],
      ["get_environment", { projectKey: "CON", name: "UAT" }, { projectKey: "CON", name: "UAT" }],
      ["get_environment", { projectKey: "CON", name: "Nowhere" }, null],
      ["get_deployment", { projectKey: "CON", version: "v2.3.0", deploymentId: dep.id }, { id: dep.id, projectKey: "CON", version: "v2.3.0" }],
      ["get_deployment", { projectKey: "CON", version: "v2.4.0", deploymentId: dep.id }, null],
    ];
    for (const [tool, args, want] of cases) {
      const got = await call(tool, args);
      if (want) expect([tool, got]).toMatchObject([tool, want]); else expect([tool, args, got]).toEqual([tool, args, null]);
    }
  }, 60_000);

  it.each([
    ["v2.3.0", "v2.3.1", "/delivery/releases/CON/v2.3.1"],
    ["v2.3.1", "2.3.1 rc/1", "/delivery/releases/CON/2.3.1%20rc%2F1"],
  ])("057 tag_release %s to %s returns where the release page moved", async (from, to, href) => {
    const sahan = await as("sahan");
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name: "tag_release", input: { projectKey: "CON", version: from, newVersion: to } }] }), () => ({ text: "Confirm?" })]), db: app, model: "claude-haiku-5-5" });
    const turn = await chatTurn(app, registry, sahan, { text: "please tag" });
    const { result } = await confirmAction(app, registry, sahan, turn.conversationId, turn.pending[0].id);
    expect(result).toMatchObject({ version: to, moved: { from: `/delivery/releases/CON/${encodeURIComponent(from)}`, to: href } });
  }, 60_000);
});
