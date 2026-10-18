import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { apiStats, receiveWebhook, REPLAY_WINDOW_MS, signPayload, verifyWebhook } from "../src";
import { apiDb, T } from "./setup";

const GH = "test-github-webhook-secret";
const ADO = "test-ado-hook-password";
const AMAX = "test-amax-inbound-secret";
const GRAPH = "test-graph-client-state";
const body = JSON.stringify({ ref: "refs/heads/main", commits: [{ id: "abc123" }] });
const github = (secret: string, id = randomUUID()) =>
  new Headers({ "x-github-delivery": id, "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` });
const adoBody = (createdDate: string) => JSON.stringify({ id: randomUUID(), eventType: "git.push", createdDate });
const ado = (password: string) => new Headers({ authorization: `Basic ${Buffer.from(`amax:${password}`).toString("base64")}` });

describe("035 AC-3 incoming webhook signatures", () => {
  it("AC3 GitHub sha256 signatures, Azure DevOps basic-auth hooks, Graph clientState and amax-signed calls, inside a 5-minute window", () => {
    const now = Date.now();
    expect(verifyWebhook({ provider: "github", headers: github(GH), body, secrets: [GH] }).ok).toBe(true);
    expect(verifyWebhook({ provider: "github", headers: github("forged"), body, secrets: [GH] })).toMatchObject({ ok: false, reason: "signature" });
    expect(verifyWebhook({ provider: "github", headers: github(GH), body: `${body} `, secrets: ["old", GH] })).toMatchObject({ ok: false, reason: "signature" });
    expect(verifyWebhook({ provider: "github", headers: new Headers(), body, secrets: [GH] })).toMatchObject({ ok: false, reason: "missing" });

    const fresh = adoBody(new Date(now - 60_000).toISOString());
    expect(verifyWebhook({ provider: "azure-devops", headers: ado(ADO), body: fresh, secrets: [ADO], now }).ok).toBe(true);
    expect(verifyWebhook({ provider: "azure-devops", headers: ado("guess"), body: fresh, secrets: [ADO], now })).toMatchObject({ ok: false, reason: "signature" });
    const stale = adoBody(new Date(now - REPLAY_WINDOW_MS - 1000).toISOString());
    expect(verifyWebhook({ provider: "azure-devops", headers: ado(ADO), body: stale, secrets: [ADO], now })).toMatchObject({ ok: false, reason: "stale" });

    const graph = JSON.stringify({ value: [{ clientState: "graph-state", resource: "users/1" }] });
    expect(verifyWebhook({ provider: "msgraph", headers: new Headers(), body: graph, secrets: ["graph-state"] }).ok).toBe(true);
    expect(verifyWebhook({ provider: "msgraph", headers: new Headers(), body: graph, secrets: ["other"] }).ok).toBe(false);

    const t = Math.floor(now / 1000) - 400;
    const signed = new Headers({ "x-amax-delivery": randomUUID(), "x-amax-signature": signPayload("s", t, body) });
    expect(verifyWebhook({ provider: "amax", headers: signed, body, secrets: ["s"], now })).toMatchObject({ ok: false, reason: "stale" });
  });
});

describe.skipIf(!hasDb)("035 AC-3 per-tenant secrets, dedupe and counting (Postgres)", () => {
  let db: Awaited<ReturnType<typeof apiDb>>;
  beforeAll(async () => {
    db = await apiDb();
    await db.secret("github-webhook", GH);
    await db.secret("amax-webhook", AMAX);
    await db.secret("msgraph-webhook", GRAPH);
  });
  afterAll(() => db?.t.drop());

  it("AC3 a verified event is accepted once; forged and unsigned calls are rejected and counted", async () => {
    const id = randomUUID();
    const first = await receiveWebhook(T, "github", github(GH, id), body);
    expect(first.ok).toBe(true);
    expect(await receiveWebhook(T, "github", github(GH, id), body)).toEqual({ ok: false, reason: "duplicate", eventId: first.eventId });
    expect(await receiveWebhook(T, "github", github("forged"), body)).toMatchObject({ ok: false, reason: "signature" });
    expect(await receiveWebhook(T, "azure-devops", ado(ADO), adoBody(new Date().toISOString()))).toMatchObject({ ok: false, reason: "not_configured" });
    const rows = await db.t.owner`select provider, verified, reason from api.inbound order by received_at`;
    expect(rows.map((r) => [r.provider, r.verified, r.reason])).toEqual([["github", true, null], ["github", false, "signature"], ["azure-devops", false, "not_configured"]]);
    const stats = await apiStats(db.app, T);
    expect(stats.inbound.find((i) => i.provider === "azure-devops")).toMatchObject({ rejected: 0, unconfigured: 1 });
    expect(stats.inbound.find((i) => i.provider === "github")).toMatchObject({ rejected: 1, unconfigured: 0 });
  }, 60_000);

  // Review 058 B6: the delivery id header isn't signed, so a captured call replayed with a fresh id
  // must still be a duplicate. Dedupe follows what the signature covers.
  it.each([
    ["github", () => github(GH, randomUUID())],
    ["amax", () => new Headers({ "x-amax-delivery": randomUUID(), "x-amax-signature": signPayload(AMAX, Math.floor(Date.now() / 1000), body) })],
    ["msgraph", () => new Headers()],
  ] as const)("058 a replayed %s call with a fresh delivery id is a duplicate", async (provider, headers) => {
    const payload = provider === "msgraph" ? JSON.stringify({ value: [{ clientState: GRAPH, resource: `users/${randomUUID()}` }] }) : body.replace("abc123", randomUUID());
    const sign = (h: Headers) => (provider === "github" ? new Headers({ ...Object.fromEntries(h), "x-hub-signature-256": `sha256=${createHmac("sha256", GH).update(payload).digest("hex")}` })
      : provider === "amax" ? new Headers({ ...Object.fromEntries(h), "x-amax-signature": signPayload(AMAX, Math.floor(Date.now() / 1000), payload) }) : h);
    expect((await receiveWebhook(T, provider, sign(headers()), payload)).ok).toBe(true);
    expect(await receiveWebhook(T, provider, sign(headers()), payload)).toMatchObject({ ok: false, reason: "duplicate" });
    expect(JSON.stringify(await db.t.owner`select * from core.audit_event`)).not.toContain(GH);
  }, 60_000);
});
