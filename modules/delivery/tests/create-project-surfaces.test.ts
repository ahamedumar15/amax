import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry, exchangeToken, issueCode, mcpResource, registerClient } from "@amax/mcp";
import { handleMcp } from "@amax/mcp/server";
import { chatTurn, confirmAction } from "@amax/chat";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";

const T = lumen.tenant.id;
const BASE = "https://amax.test";
const REDIRECT = "http://127.0.0.1:7777/cb";
const TAKEN = { key: "CON", name: "Again", client: "x", billing: "fixed" };

// 045 review round 3: what an MCP client and a chat user actually see when a project key is taken.
// (No screen creates projects; MCP and chat are the user-facing paths.)
describe.skipIf(!hasDb)("045 a taken project key, as each caller sees it (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let admin: Viewer;
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
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = 'sahan@lumenlabs.test'`));
    admin = (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
  });
  afterAll(() => t?.drop());

  const token = async () => {
    const client = await registerClient(app, { client_name: "045", redirect_uris: [REDIRECT] });
    const verifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(verifier).digest("base64url");
    const redirect = await issueCode(app, admin, { clientId: client.client_id, redirectUri: REDIRECT, scopes: ["read", "write"], codeChallenge, resource: mcpResource(BASE) });
    const code = new URL(redirect).searchParams.get("code")!;
    return (await exchangeToken(app, new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: client.client_id }))).access_token;
  };

  it("AC-3 an MCP client gets a tool error that says the key is taken", async () => {
    const req = new Request(`${BASE}/api/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_project", arguments: TAKEN } }),
    });
    const body = await (await handleMcp(req, { db: app, registry, base: BASE })).json();
    expect(body.result).toMatchObject({ isError: true, content: [{ type: "text", text: "project key CON is taken; choose another" }] });
  });

  it("AC-3 a chat confirm fails as 'failed', not 'retry', with the conflict as its message", async () => {
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c", name: "create_project", input: TAKEN }] }), () => ({ text: "Add it?" })]), db: app, model: "claude-haiku-5-5" });
    const turn = await chatTurn(app, registry, admin, { text: "new project CON" });
    await expect(confirmAction(app, registry, admin, turn.conversationId, turn.pending[0].id))
      .rejects.toMatchObject({ kind: "failed", message: "project key CON is taken; choose another" });
  });
});
