import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createCredential } from "@amax/auth/credentials";
import { exchangeClientCredentials } from "@amax/auth/client-credentials";
import { handleRest } from "../src";
import { demoRegistry, person, rest } from "./people";
import { apiDb, job, T } from "./setup";

describe.skipIf(!hasDb)("008 AC-1 a service credential limited to named tools", () => {
  let db: Awaited<ReturnType<typeof apiDb>>;
  const registry = demoRegistry();
  const call = (req: Request) => handleRest(req, { db: db.app, registry, base: "http://localhost" });
  beforeAll(async () => { db = await apiDb(); });
  afterAll(() => db?.t.drop());

  it("calls only its listed tools, by API key or client credentials, and still only for the people it may act for", async () => {
    const maya = await person(db.app, T, "maya-tools", ["Admin"]);
    const dev = await person(db.app, T, "dev-tools", ["Engineer"]);
    const ci = await createCredential(job(), { name: "specclaw CI", scopes: ["demo:write", "core:read"], actsFor: ["dev-tools@example.test"], days: 30, ownerUserId: maya.id, tools: ["add_note"] });
    const key = ci.reveal.value;
    expect((await call(rest("/tools/add_note", { token: key, actFor: dev.id, body: { text: "from CI" } }))).status).toBe(200);
    expect((await call(rest("/tools/whoami", { token: key, actFor: dev.id }))).status).toBe(403);
    expect((await call(rest("/tools/add_note", { token: key, actFor: maya.id, body: { text: "x" } }))).status).toBe(403);
    const { access_token } = await exchangeClientCredentials(db.app, new URLSearchParams({ grant_type: "client_credentials", client_id: ci.id, client_secret: key }));
    expect((await call(rest("/tools/whoami", { token: access_token, actFor: dev.id }))).status).toBe(403);
    const open = await createCredential(job(), { name: "Unlimited", scopes: ["core:read"], actsFor: ["dev-tools@example.test"], days: 30, ownerUserId: maya.id });
    expect((await call(rest("/tools/whoami", { token: open.reveal.value, actFor: dev.id }))).status).toBe(200);
    const refusals = await db.t.owner`select after->>'reason' as r from core.audit_event where action = 'auth.principal.refused' and resource_id = ${ci.id} order by seq`;
    expect(refusals.map((r) => r.r)).toEqual(["limited to add_note", "not allowed to act for this person", "limited to add_note"]);
  }, 60_000);
});
