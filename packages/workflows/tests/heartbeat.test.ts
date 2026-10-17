import { describe, expect, it } from "vitest";
import type { Db } from "@amax/db";
import { heartbeat } from "../src/pg/store";

const run = { id: "r", tenantId: "t", lease: "l" };
const tx = (fencedRows: unknown[]) => ({ execute: async (q: { queryChunks?: unknown[] }) => (JSON.stringify(q).includes("update workflows.run") ? fencedRows : []) });
const dbs: [string, Pick<Db, "transaction">, RegExp][] = [
  ["a renewal that hangs", { transaction: () => new Promise(() => {}) } as never, /in time/],
  ["renewals that fail", { transaction: () => Promise.reject(new Error("connection reset")) } as never, /in time/],
  ["a lease another worker took", { transaction: (fn: (t: unknown) => unknown) => Promise.resolve(fn(tx([]))) } as never, /another worker/],
];

describe("AC-2 lease heartbeat", () => {
  it.each(dbs)("aborts the step on %s before the lease runs out", async (_name, db, reason) => {
    const stop = new AbortController();
    const end = heartbeat(db, run, 1.5, stop);
    const started = Date.now();
    await new Promise<void>((r) => stop.signal.addEventListener("abort", () => r(), { once: true }));
    end();
    expect(Date.now() - started).toBeLessThan(1500);
    expect(String(stop.signal.reason)).toMatch(reason);
  });

  it("keeps a step running while renewals are confirmed", async () => {
    const stop = new AbortController();
    const end = heartbeat({ transaction: (fn: (t: unknown) => unknown) => Promise.resolve(fn(tx([1]))) } as never, run, 1.5, stop);
    await new Promise((r) => setTimeout(r, 2500));
    end();
    expect(stop.signal.aborted).toBe(false);
  });
});
