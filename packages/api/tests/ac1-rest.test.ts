import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createCredential } from "@amax/auth/credentials";
import { exchangeClientCredentials } from "@amax/auth/client-credentials";
import { handleRest } from "../src";
import { demoRegistry, person, rest } from "./people";
import { apiDb, job, T } from "./setup";

describe.skipIf(!hasDb)("035 AC-1 AC-2 REST API from the tool registry (Postgres)", () => {
  let db: Awaited<ReturnType<typeof apiDb>>;
  const registry = demoRegistry();
  const call = (req: Request) => handleRest(req, { db: db.app, registry, base: "http://localhost" });
  beforeAll(async () => { db = await apiDb(); });
  afterAll(() => db?.t.drop());

  it("AC1 an OpenAPI 3.1 document and tool calls with the same permissions, audit and trace as MCP", async () => {
    const doc = await (await call(rest("/openapi.json", { method: "GET" }))).json();
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.paths["/tools/add_note"].post).toMatchObject({ operationId: "add_note", "x-amax-scope": "demo:write", requestBody: { content: { "application/json": { schema: { properties: { text: { type: "string" } } } } } } });

    const kasun = await person(db.app, T, "kasun", ["Engineer"]);
    const liam = await person(db.app, T, "liam", ["Sales"]);
    const ok = await call(rest("/tools/add_note", { token: kasun.token, body: { text: "from CI" } }));
    expect([ok.status, await ok.json()]).toEqual([200, { result: { saved: "from CI" } }]);
    expect((await call(rest("/tools/add_note", { token: liam.token, body: { text: "x" } }))).status).toBe(403);
    expect((await call(rest("/tools/add_note", { token: kasun.token, body: { text: "" } }))).status).toBe(400);
    expect((await call(rest("/tools/add_note", { body: { text: "x" } }))).status).toBe(401);
    const [a] = await db.t.owner`select actor, source, trace_id from core.audit_event where action = 'demo.note.add'`;
    expect(a).toMatchObject({ actor: `user:${kasun.id}`, source: "api" });
    const steps = await db.t.owner`select kind, actor, detail from core.trace_event where trace_id = ${a.trace_id} order by seq`;
    expect(steps.map((s) => s.kind)).toEqual(["mcp_call", "tool_call"]);
  }, 60_000);

  it("AC2 a service credential acts only within its module scopes and for listed people, by API key or client credentials", async () => {
    const maya = await person(db.app, T, "maya", ["Admin"]);
    const kasun = await person(db.app, T, "kasun2", ["Engineer"]);
    const make = (name: string, scopes: string[]) => createCredential(job(), { name, scopes, actsFor: ["kasun2@example.test"], days: 365, ownerUserId: maya.id });
    const ci = await make("specclaw CI", ["demo:write"]);
    const reader = await make("Report export", ["demo:read"]);
    await expect(createCredential(job(), { name: "Too long", scopes: ["demo:read"], actsFor: [], days: 366, ownerUserId: maya.id })).rejects.toThrow(/366|365/);

    const key = ci.reveal.value;
    expect((await call(rest("/tools/add_note", { token: key, actFor: kasun.id, body: { text: "by CI" } }))).status).toBe(200);
    expect((await call(rest("/tools/add_note", { token: key, actFor: maya.id, body: { text: "x" } }))).status).toBe(403);
    expect((await call(rest("/tools/add_note", { token: key, body: { text: "x" } }))).status).toBe(403);
    expect((await call(rest("/tools/add_note", { token: reader.reveal.value, actFor: kasun.id, body: { text: "x" } }))).status).toBe(403);

    const form = new URLSearchParams({ grant_type: "client_credentials", client_id: ci.id, client_secret: key });
    const { access_token, expires_in } = await exchangeClientCredentials(db.app, form);
    expect(expires_in).toBeLessThanOrEqual(3600);
    expect((await call(rest("/tools/add_note", { token: access_token, actFor: kasun.id, body: { text: "by token" } }))).status).toBe(200);
    await expect(exchangeClientCredentials(db.app, new URLSearchParams({ client_id: ci.id, client_secret: access_token }))).rejects.toThrow(/wrong/);

    const [s] = await db.t.owner`select token_hash, expires_at - created_at <= interval '365 days' as bounded from auth.service_principal where id = ${ci.id}`;
    expect(s.token_hash).not.toBe(key);
    expect(s.bounded).toBe(true);
    const trace = await db.t.owner`select actor, on_behalf_of from core.trace_event where actor = ${`sp:${ci.id}`}`;
    expect(trace[0]).toEqual({ actor: `sp:${ci.id}`, on_behalf_of: `user:${kasun.id}` });
    const refusals = await db.t.owner`select after->>'reason' as r from core.audit_event where action = 'auth.principal.refused' order by seq`;
    expect(refusals.map((r) => r.r)).toEqual(["not allowed to act for this person", "name the person it acts for in the amax-act-for header", "outside its scopes (needs demo:write)"]);
  }, 60_000);
});
