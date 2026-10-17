import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "@temporalio/client";
import { hasDb } from "@amax/db/testdb";
import { createActivities } from "../src/temporal/activities";
import { connector } from "../src/temporal/engine";
import { pgHarness, TENANT, type Harness } from "./harness";

describe("AC-3 Temporal connection", () => {
  it("reconnects after a failed connect and shares one connection between callers", async () => {
    const client = {} as Client;
    let calls = 0;
    const connect = connector(async () => {
      calls++;
      if (calls === 1) throw new Error("frontend restarting");
      return client;
    });
    await expect(connect()).rejects.toThrow(/restarting/);
    const [a, b] = await Promise.all([connect(), connect()]);
    expect([a, b, await connect()]).toEqual([client, client, client]);
    expect(calls).toBe(2);
  });
});

describe.skipIf(!hasDb)("AC-5 Temporal mirror", () => {
  let h: Harness;
  beforeAll(async () => void (h = await pgHarness()), 60_000);
  afterAll(async () => void (await h?.close()));

  it("refuses to mark a run whose row doesn't exist (yet), so Temporal retries instead of losing the update", async () => {
    const mark = createActivities(h.db, h.registry).mark;
    const args = (runId: string) => ({ runId, tenantId: TENANT, workflow: "test.counter", version: 1, input: null, actsFor: null, legalEntityId: null });
    for (const runId of ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"]) {
      await expect(mark(args(runId), { status: "running" })).rejects.toThrow(/no row yet/);
    }
    const id = await h.engine.start(TENANT, "test.early", { id: "mirror" }, { startedBy: "test" });
    await expect(mark(args(id), { status: "waiting" })).resolves.toBeUndefined();
  });
});
