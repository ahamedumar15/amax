import { describe, expect, it, vi } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { CONNECTOR_IDS, putSecret, SecretLeakError, useSecret, type ConnectorId } from "../src/secrets";
import { logError, registryFrom, runDueJobs, scheduleJob } from "../src/server";
import { admin, databaseText, job, secretsDb, T, testValue } from "./secrets-fixture";

const fakeConnector = async (connector: ConnectorId, token: string) => {
  const s = { connector, header: `Bearer ${token}` };
  console.log("calling", connector, s.header.length);
  throw Object.assign(new Error(`401 from ${connector}: rejected ${s.header} (${encodeURIComponent(token)})`), { config: { headers: { authorization: s.header } } });
};

describe.skipIf(!hasDb)("031 AC-2 values never leave useSecret", () => {
  const db = secretsDb();

  it("AC2 every connector fixture leaves no value in logs, errors, audit, events or job runs", async () => {
    const lines: string[] = [];
    for (const m of ["log", "info", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" ")));
    const values = Object.fromEntries(CONNECTOR_IDS.map((c) => [c, testValue(c)])) as Record<ConnectorId, string>;
    const errors: string[] = [];
    for (const connector of CONNECTOR_IDS) {
      await putSecret(admin, { connector, value: values[connector], expiresAt: null });
      await useSecret(job, { connector, purpose: "fixture" }, async (s) => {
        console.log("secret object", s, JSON.stringify({ s }), `${s}`);
        return { ok: true };
      });
      await expect(useSecret(job, { connector, purpose: "echo" }, async (s) => ({ token: s.reveal() }))).rejects.toThrow(SecretLeakError);
      const e = await useSecret(job, { connector, purpose: "sync" }, (s) => fakeConnector(connector, s.reveal())).catch((x: Error) => x);
      errors.push(String((e as Error).message), String((e as Error).stack), JSON.stringify(e));
      logError("connector", e);
    }
    const registry = registryFrom([{ id: "t", jobs: [{ name: "t.sync", run: ({ tenantId }) => useSecret({ ...job, tenantId }, { connector: "xero", purpose: "job" }, (s) => fakeConnector("xero", s.reveal())) }] }]);
    await withTenant(db.app, T, (tx) => scheduleJob(tx, { tenantId: T, name: "t.sync" }));
    expect((await runDueJobs(db.app, registry)).jobsFailed).toBe(1);
    const haystack = [lines.join("\n"), errors.join("\n"), await databaseText(db.t.owner)].join("\n");
    expect(haystack).toContain("[secret]");
    for (const v of Object.values(values)) for (const form of [v, Buffer.from(v).toString("base64"), encodeURIComponent(v)]) expect(haystack).not.toContain(form);
    vi.restoreAllMocks();
  });
});
