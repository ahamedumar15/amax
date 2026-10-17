import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { handleTick, tickRequest } from "../lib/tick";
// @ts-ignore — plain ESM script, no types
import { runWorker } from "../scripts/worker.mjs";

const ok = async () => ({ jobs: 1, jobsFailed: 0, events: 2, eventsFailed: 0, scheduled: 0 });
const req = (auth?: string) => new Request("http://x/api/jobs/tick", { headers: auth ? { authorization: auth } : {} });

describe("AC-4 /api/jobs/tick", () => {
  it("requires the cron secret", async () => {
    expect((await handleTick(req(), { secret: "s3cret", run: ok })).status).toBe(401);
    expect((await handleTick(req("Bearer nope"), { secret: "s3cret", run: ok })).status).toBe(401);
    expect((await handleTick(req("Bearer s3cret"), { secret: undefined, run: ok })).status).toBe(503);
  });
  it("runs a tick and reports counts", async () => {
    const res = await handleTick(req("Bearer s3cret"), { secret: "s3cret", run: ok });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, jobs: 1, events: 2 });
  });
  it("says so when no database is configured", async () => {
    expect((await handleTick(req("Bearer s3cret"), { secret: "s3cret", run: null })).status).toBe(503);
  });
  it("builds the Cloudflare cron request the route accepts", async () => {
    const r = tickRequest("s3cret");
    expect(new URL(r.url).pathname).toBe("/api/jobs/tick");
    expect((await handleTick(r, { secret: "s3cret", run: ok })).status).toBe(200);
  });
});

describe("AC-4 worker command", () => {
  it("calls the tick route on an interval with the secret and stops on abort", async () => {
    const seen: string[] = [];
    const server = createServer((r, res) => { seen.push(`${r.method} ${r.url} ${r.headers.authorization}`); res.end("{}"); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/jobs/tick`;
    const stop = new AbortController();
    const done = runWorker({ url, secret: "s3cret", intervalMs: 20, signal: stop.signal, log: () => {} });
    await new Promise((r) => setTimeout(r, 90));
    stop.abort();
    await done;
    server.close();
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(new Set(seen)).toEqual(new Set(["POST /api/jobs/tick Bearer s3cret"]));
  });
});
