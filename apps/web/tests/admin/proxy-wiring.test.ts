import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hasDb, migratedDatabase } from "@amax/db/testdb";

// Review 058 rounds 2 and 3: page 429s reach api.rate_limited whether the proxy runs alone (Vercel,
// Cloudflare) or beside the app (k3s), in either order. Each "bundle" is a fresh module graph, as Next
// compiles the proxy and the app separately; only globalThis is shared, as in one process.
const T = "05805805-0000-4000-8000-000000000058";
type Bundle = { wiring: typeof import("../../lib/rate-wiring"); core: typeof import("@amax/core/server") };

async function proxyBundle(): Promise<Bundle> {
  vi.resetModules();
  const wiring = await import("../../lib/rate-wiring");
  expect(wiring.wireProxy()).toBe(true);
  return { wiring, core: await import("@amax/core/server") };
}
async function appBundle(): Promise<Bundle> {
  vi.resetModules();
  const server = await import("../../lib/server");
  expect(server.getDb()).toBeTruthy();
  return { wiring: await import("../../lib/rate-wiring"), core: await import("@amax/core/server") };
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
    const proxy = bundles.proxy;
    const takes = [1, 2, 3].map(() => proxy.core.takeRate({ tenantId: T, userId: `u-${order.join("-")}`, channel: "page" }).ok);
    expect(takes).toEqual([true, true, false]);
    for (const b of Object.values(bundles)) await b.wiring.flushRateLimited();
    const rows = await t.owner`select channel, count from api.rate_limited where tenant_id = ${T}`;
    expect(rows.map((r) => [r.channel, Number(r.count)])).toEqual([["page", 1]]);
  }, 60_000);
});
