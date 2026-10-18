import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { configureRateLimits, takeRate } from "@amax/core/server";
import { createApiToken } from "@amax/auth";
import { handleMcp } from "@amax/mcp/server";
import { handleRest, rateLimitRecorder } from "../src";
import { demoRegistry, person, rest } from "./people";
import { apiDb, OTHER, T } from "./setup";

const whoami = (token: string, id: number) => new Request("http://localhost/api/mcp", {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "whoami", arguments: {} } }),
});

describe.skipIf(!hasDb)("035 AC-5 rate limits across pages, REST and MCP (Postgres)", () => {
  let db: Awaited<ReturnType<typeof apiDb>>;
  const registry = demoRegistry();
  const recorder = rateLimitRecorder(60_000);
  beforeAll(async () => {
    db = await apiDb();
    configureRateLimits({ call: { token: 30, user: 30, tenant: 40 }, page: { user: 5, tenant: 100 }, sink: recorder.sink, now: () => 1_800_000_000_000 });
  });
  afterAll(async () => {
    configureRateLimits({ now: Date.now });
    await db?.t.drop();
  });

  it("AC5 flooding MCP from one tenant gets 429 with Retry-After, and another tenant is unaffected", async () => {
    const flooder = await person(db.app, T, "flood", ["Engineer"]);
    const calm = await person(db.app, OTHER, "calm", ["Engineer"]);
    const mcpToken = (v: typeof flooder.viewer) => createApiToken(db.app, v, { kind: "mcp", name: "client", days: 1 });
    const [floodKey, calmKey] = [await mcpToken(flooder.viewer), await mcpToken(calm.viewer)];
    const mcp = (token: string, id: number) => handleMcp(whoami(token, id), { db: db.app, registry, base: "http://localhost" });

    const statuses: number[] = [];
    for (let i = 0; i < 35; i++) statuses.push((await mcp(floodKey, i)).status);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    const limited = await mcp(floodKey, 99);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);

    const other = await mcp(calmKey, 1);
    expect(other.status).toBe(200);
    expect(JSON.stringify(await other.json())).toContain(calm.id);

    const restLimited = await handleRest(rest("/tools/add_note", { token: flooder.token, body: { text: "x" } }), { db: db.app, registry, base: "http://localhost" });
    expect([restLimited.status, Number(restLimited.headers.get("retry-after")) > 0]).toEqual([429, true]);

    const pages = Array.from({ length: 6 }, () => takeRate({ tenantId: T, userId: flooder.id, channel: "page" }).ok);
    expect(pages).toEqual([true, true, true, true, true, false]);
    expect(takeRate({ tenantId: OTHER, userId: calm.id, channel: "page" }).ok).toBe(true);

    await recorder.flush();
    const counts = await withTenant(db.app, T, (tx) => tx.execute(sql`select channel, sum(count)::int as n from api.rate_limited group by channel order by channel`));
    expect(counts.map((r) => [r.channel, r.n])).toEqual([["mcp", 6], ["page", 1], ["rest", 1]]);
    expect((await db.t.owner`select count(*)::int as n from api.rate_limited where tenant_id = ${OTHER}`)[0].n).toBe(0);
  }, 60_000);
});
