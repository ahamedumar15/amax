import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { createPostgresEngine, workflowRegistry, type WorkflowEngine } from "@amax/workflows/server";
import { apiPlatform, MAX_FAILURES, RETRY, setEgress, subscribeWebhook, verifyWebhook } from "../src";
import { apiDb, job, T } from "./setup";

const SECRET = "test-amax-webhook-signing-secret";
const EVENT = "hr.person.updated";

describe.skipIf(!hasDb)("035 AC-4 outgoing webhooks (Postgres)", () => {
  let db: Awaited<ReturnType<typeof apiDb>>;
  let engine: WorkflowEngine;
  const platform = apiPlatform([{ events: { emits: [EVENT], payloads: { [EVENT]: { name: "plain", salary: "pay" } } } }], async () => engine);
  const sent: { url: string; headers: Headers; body: string }[] = [];

  const emit = (payload: Record<string, unknown>) =>
    withTenant(db.app, T, (tx) => platform.events.handles[0].handle({ tx, tenantId: T, event: { id: randomUUID(), name: EVENT, payload } }));
  async function drain() {
    for (let i = 0; i < 200; i++) {
      await db.t.owner`update workflows.run set wake_at = now() where status in ('running', 'sleeping') and wake_at > now()`;
      await engine.tick();
      const [{ n }] = await db.t.owner`select count(*)::int as n from workflows.run where status not in ('completed', 'failed', 'cancelled')`;
      if (n === 0) return;
    }
    throw new Error("runs never finished");
  }

  beforeAll(async () => {
    db = await apiDb();
    await db.secret("amax-webhook", SECRET);
    engine = createPostgresEngine({ db: db.app, registry: workflowRegistry([platform]) });
    // The wire is faked; the address checks in safePost still run on the fake resolver's answer.
    setEgress({
      resolve: async () => [{ address: "1.1.1.1", family: 4 }],
      send: (url, init, lookup) => new Promise((ok, fail) => lookup(url.hostname, { all: true }, (e) => {
        if (e) return fail(e);
        sent.push({ url: url.href, headers: new Headers(init.headers), body: init.body });
        ok(url.pathname.includes("/broken") ? 500 : 204);
      })),
    });
  });
  afterAll(async () => {
    setEgress({});
    await db?.t.drop();
  });

  it("AC4 payloads are masked and HMAC-signed with a timestamp; failures retry with backoff and switch the webhook off", async () => {
    const ok = await subscribeWebhook(job(), { name: "People sync", url: "https://hooks.example.test/people", events: [EVENT] });
    const broken = await subscribeWebhook(job(), { name: "Broken receiver", url: "https://hooks.example.test/broken", events: [EVENT] });
    await emit({ name: "Test Person", salary: 120000, bankAccount: "000-111" });
    await drain();

    const good = sent.filter((s) => s.url.endsWith("/people"));
    expect(good).toHaveLength(1);
    expect(verifyWebhook({ provider: "amax", headers: good[0].headers, body: good[0].body, secrets: [SECRET] }).ok).toBe(true);
    expect(verifyWebhook({ provider: "amax", headers: good[0].headers, body: good[0].body, secrets: ["wrong"] }).ok).toBe(false);
    expect(JSON.parse(good[0].body).data).toEqual({ name: "Test Person", salary: { masked: true, class: "pay" }, bankAccount: { masked: true, class: "undeclared" } });
    expect(sent.filter((s) => s.url.endsWith("/broken"))).toHaveLength(RETRY.maxAttempts);

    for (let i = 1; i < MAX_FAILURES; i++) await emit({ name: `Person ${i}` });
    await drain();
    const [w] = await db.t.owner`select status, failures from api.webhook where id = ${broken.id}`;
    expect(w).toEqual({ status: "off", failures: MAX_FAILURES });
    const before = sent.length;
    await emit({ name: "After switch-off" });
    await drain();
    expect(sent.slice(before).map((s) => s.url)).toEqual(["https://hooks.example.test/people"]);
    const [d] = await db.t.owner`select count(*) filter (where ok)::int as ok, count(*)::int as total from api.delivery where webhook_id = ${ok.id}`;
    expect(d).toEqual({ ok: MAX_FAILURES + 1, total: MAX_FAILURES + 1 });
  }, 120_000);

  it("060 AC7 no signing secret: subscribing is refused, and a delivery isn't counted as the receiver's failure", async () => {
    const hook = await subscribeWebhook(job(), { name: "Setup check", url: "https://hooks.example.test/setup", events: [EVENT] });
    await db.t.owner`update secrets.credential set revoked_at = now() where connector = 'amax-webhook' and revoked_at is null`;
    await expect(subscribeWebhook(job(), { name: "No secret", url: "https://hooks.example.test/none", events: [EVENT] })).rejects.toThrow(/signing secret/);
    for (let i = 0; i <= MAX_FAILURES; i++) await emit({ name: `No secret ${i}` });
    await drain();
    expect((await db.t.owner`select status, failures from api.webhook where id = ${hook.id}`)[0]).toEqual({ status: "active", failures: 0 });
    expect(sent.filter((s) => s.url.endsWith("/setup"))).toHaveLength(0);
  }, 120_000);
});
