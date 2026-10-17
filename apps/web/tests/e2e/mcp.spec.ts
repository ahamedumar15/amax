import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test, type Page } from "@playwright/test";

const REDIRECT = "http://127.0.0.1:9/callback";

async function connectClient(page: Page, baseURL: string, scope: string) {
  const reg = await (await fetch(`${baseURL}/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "e2e client", redirect_uris: [REDIRECT] }) })).json();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(`${baseURL}/oauth/authorize`);
  Object.entries({ client_id: reg.client_id, redirect_uri: REDIRECT, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", scope, state: "xyz", resource: `${baseURL}/api/mcp` })
    .forEach(([k, v]) => url.searchParams.set(k, v));
  let code = "";
  await page.route(`${REDIRECT}**`, (route) => { code = new URL(route.request().url()).searchParams.get("code") ?? ""; return route.fulfill({ body: "ok" }); });
  await page.goto(url.toString());
  if (await page.getByLabel("Demo user (fixtures only)").isVisible().catch(() => false)) {
    await page.getByLabel("Demo user (fixtures only)").fill("maya@lumenlabs.test");
    await page.getByRole("button", { name: "Sign in as demo user" }).click();
  }
  await expect(page.getByRole("heading", { name: "Allow e2e client to use amax?" })).toBeVisible();
  for (const s of scope.split(" ")) await expect(page.locator("li", { hasText: s })).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect.poll(() => code).not.toBe("");
  const token = await (await fetch(`${baseURL}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: reg.client_id }) })).json();
  return { reg, token, code, verifier };
}

async function mcp(baseURL: string, accessToken: string) {
  const client = new Client({ name: "e2e", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/api/mcp`), { requestInit: { headers: { authorization: `Bearer ${accessToken}` } } }));
  return client;
}

test("AC1 metadata, and no token means 401 with the resource metadata pointer", async ({ baseURL }) => {
  const prm = await (await fetch(`${baseURL}/.well-known/oauth-protected-resource`)).json();
  expect(prm.resource).toBe(`${baseURL}/api/mcp`);
  const as = await (await fetch(`${baseURL}/.well-known/oauth-authorization-server`)).json();
  expect(as.code_challenge_methods_supported).toEqual(["S256"]);
  const res = await fetch(`${baseURL}/api/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(res.status).toBe(401);
  expect(res.headers.get("www-authenticate")).toContain("resource_metadata=");
});

test("AC1/AC3 OAuth with PKCE and consent; the tool list follows roles and scopes; calls work", async ({ page, baseURL }) => {
  const { token, code, verifier, reg } = await connectClient(page, baseURL!, "read");
  expect(token.token_type).toBe("Bearer");
  expect(token.scope).toBe("read");
  const client = await mcp(baseURL!, token.access_token);
  const names = (await client.listTools()).tools.map((t) => t.name);
  expect(names).toEqual(expect.arrayContaining(["whoami", "search", "list_projects", "get_project"]));
  expect(names).not.toContain("move_proposal");
  const who = await client.callTool({ name: "whoami", arguments: {} });
  expect(JSON.stringify(who.content)).toContain("Maya Fernando");
  const projects = await client.callTool({ name: "list_projects", arguments: {} });
  expect(JSON.stringify(projects.content)).toContain("Contoso Portal");
  await client.close();
  // A code works once.
  const again = await fetch(`${baseURL}/oauth/token`, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: reg.client_id }) });
  expect(again.status).toBe(400);
});

test("refresh rotates, revoke ends access", async ({ page, baseURL }) => {
  const { token, reg } = await connectClient(page, baseURL!, "read write");
  const write = await mcp(baseURL!, token.access_token);
  expect((await write.listTools()).tools.map((t) => t.name)).toContain("move_proposal");
  await write.close();
  // Review round 1: a refresh must name the client it was issued to.
  const anon = await fetch(`${baseURL}/oauth/token`, { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: token.refresh_token }) });
  expect(anon.status).toBe(400);
  const rotated = await (await fetch(`${baseURL}/oauth/token`, { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: token.refresh_token, client_id: reg.client_id }) })).json();
  expect(rotated.access_token).toBeTruthy();
  const reuse = await fetch(`${baseURL}/oauth/token`, { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: token.refresh_token, client_id: reg.client_id }) });
  expect(reuse.status).toBe(400);
  const old = await fetch(`${baseURL}/api/mcp`, { method: "POST", headers: { authorization: `Bearer ${token.access_token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  expect(old.status).toBe(401);
  await fetch(`${baseURL}/oauth/revoke`, { method: "POST", body: new URLSearchParams({ token: rotated.access_token }) });
  const after = await fetch(`${baseURL}/api/mcp`, { method: "POST", headers: { authorization: `Bearer ${rotated.access_token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  expect(after.status).toBe(401);
});

test("AC4 Integrations lists tools by module with who can use them, and connected clients can be revoked", async ({ page, baseURL }) => {
  await connectClient(page, baseURL!, "read");
  await page.goto("/settings/integrations");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Integrations");
  const row = page.locator("tr", { hasText: "record_deployment" });
  await expect(row).toContainText("write");
  await expect(row).toContainText("PM");
  await expect(page.locator("tr", { hasText: "whoami" })).toContainText("Employee");
  const rows = page.locator("tr", { hasText: "e2e client" });
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);
  await rows.first().getByRole("button", { name: "Revoke" }).click();
  await expect(rows).toHaveCount(before - 1);
});
