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
});
