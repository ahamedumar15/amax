import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hasDb, migratedDatabase } from "@amax/db/testdb";

// Review 058 rounds 2 and 3: page 429s reach api.rate_limited whether the proxy runs alone (Vercel,
// Cloudflare) or beside the app (k3s), in either order. Each "bundle" is a fresh module graph, as Next
// compiles the proxy and the app separately; only globalThis is shared, as in one process.
const T = "05805805-0000-4000-8000-000000000058";
type Bundle = { wiring: typeof import("../../lib/rate-wiring"); core: typeof import("@amax/core/server"); privacy: typeof import("@amax/core/privacy") };

async function proxyBundle(): Promise<Bundle> {
  vi.resetModules();
  const wiring = await import("../../lib/rate-wiring");
  expect(wiring.wireProxy()).toBe(true);
  return { wiring, core: await import("@amax/core/server"), privacy: await import("@amax/core/privacy") };
}
async function appBundle(): Promise<Bundle> {
  vi.resetModules();
  const server = await import("../../lib/server");
  expect(server.getDb()).toBeTruthy();
  return { wiring: await import("../../lib/rate-wiring"), core: await import("@amax/core/server"), privacy: await import("@amax/core/privacy") };
}

describe.skipIf(!hasDb)("058 the proxy records page 429s on every host (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  const saved = { ...process.env };
  beforeAll(async () => {
    t = await migratedDatabase();
    await t.owner`insert into core.tenant (id, name) values (${T}, 'Proxy test (fictional)')`;
    Object.assign(process.env, { DATABASE_URL: t.url, AUDIT_HASH_KEY: "p".repeat(32), AMAX_RATE_PAGE_USER: "2" });
  }, 60_000);
  afterAll(async () => {
    process.env = saved;
    delete (globalThis as { amaxDb?: unknown }).amaxDb;
    await t?.drop();
  });

  it.each([
    ["the proxy alone", ["proxy"]],
    ["the proxy first, then the app", ["proxy", "app"]],
    ["the app first, then the proxy", ["app", "proxy"]],
  ] as const)("%s", async (_, order) => {
    delete (globalThis as { amaxDb?: unknown }).amaxDb;
    await t.owner`delete from api.rate_limited`;
    const bundles: Record<string, Bundle> = {};
    for (const b of order) bundles[b] = b === "proxy" ? await proxyBundle() : await appBundle();
    // Every bundle wired its own runtime, whichever ran first.
    for (const b of Object.values(bundles)) expect(() => b.core.getRuntime()).not.toThrow();
    // The app's bundle wired all of itself even when the proxy opened the shared Db client first.
    if (bundles.app) expect(bundles.app.privacy.privacyRules().map((r) => r.table)).toEqual(expect.arrayContaining(["api.rate_limited", "hr.person", "chat.conversation"]));
    const proxy = bundles.proxy;
    const takes = [1, 2, 3].map(() => proxy.core.takeRate({ tenantId: T, userId: `u-${order.join("-")}`, channel: "page" }).ok);
    expect(takes).toEqual([true, true, false]);
    for (const b of Object.values(bundles)) await b.wiring.flushRateLimited();
    const rows = await t.owner`select channel, count from api.rate_limited where tenant_id = ${T}`;
    expect(rows.map((r) => [r.channel, Number(r.count)])).toEqual([["page", 1]]);
  }, 60_000);

  it.each([
    ["no database (the guest preview)", { DATABASE_URL: "" }, false],
    ["a database without the audit key", { AUDIT_HASH_KEY: "" }, /AUDIT_HASH_KEY is required/],
  ] as const)("wireProxy with %s", async (_, env, want) => {
    const before = { DATABASE_URL: process.env.DATABASE_URL, AUDIT_HASH_KEY: process.env.AUDIT_HASH_KEY };
    for (const [k, v] of Object.entries(env)) if (v) process.env[k] = v; else delete process.env[k];
    try {
      vi.resetModules();
      const wiring = await import("../../lib/rate-wiring");
      if (want === false) expect(wiring.wireProxy()).toBe(false);
      else expect(() => wiring.wireProxy()).toThrow(want);
    } finally {
      Object.assign(process.env, before);
    }
  });
});

