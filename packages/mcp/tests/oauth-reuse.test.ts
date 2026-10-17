import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { upsertPasswordUser, viewerForUser } from "@amax/auth";
import { authenticateMcp, exchangeToken, issueCode, mcpResource, registerClient } from "../src/oauth";

const T = "cdcdcdcd-0000-4000-8000-0000000000cd";
const BASE = "https://amax.test";
const REDIRECT = "http://127.0.0.1:7777/cb";

describe.skipIf(!hasDb)("refresh-token reuse ends the whole grant (review round 2)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    await t.owner`insert into core.tenant (id, name) values (${T}, 'amax')`;
  });
  afterAll(() => t?.drop());

  it("replaying a rotated refresh token revokes the rotated pair and is audited", async () => {
    const userId = await upsertPasswordUser(app, T, { email: "pm@amax.test", name: "PM", roles: ["PM"], password: "pm-password-1234" });
    const viewer = (await withTenant(app, T, (tx) => viewerForUser(tx, T, userId)))!;
    const client = await registerClient(app, { client_name: "reuse test", redirect_uris: [REDIRECT] });
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const redirect = await issueCode(app, viewer, { clientId: client.client_id, redirectUri: REDIRECT, scopes: ["read"], codeChallenge: challenge, resource: mcpResource(BASE) });
    const code = new URL(redirect).searchParams.get("code")!;
    const first = await exchangeToken(app, new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: client.client_id }));
    const refresh = (rt: string) => exchangeToken(app, new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt, client_id: client.client_id }));

    const rotated = await refresh(first.refresh_token);
    expect(await authenticateMcp(app, rotated.access_token, mcpResource(BASE))).not.toBeNull();

    await expect(refresh(first.refresh_token)).rejects.toThrow(/reuse/);
    expect(await authenticateMcp(app, rotated.access_token, mcpResource(BASE))).toBeNull();
    await expect(refresh(rotated.refresh_token)).rejects.toThrow();
    const [audit] = await t.owner`select count(*)::int as n from core.audit_event where action = 'auth.oauth.reuse_detected'`;
    expect(audit.n).toBe(1);
  });
});
