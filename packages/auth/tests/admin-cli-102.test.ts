import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { verifyAuditChain } from "@amax/core/server";

const KEY = "k".repeat(32);
const pkg = join(__dirname, "..");
const BUDGET = 60_000;

describe.skipIf(!hasDb)("102 admin CLI audit key", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let tenant: string;

  const run = (args: string[], key: string | null = KEY) => {
    const env = { ...process.env, DATABASE_MIGRATE_URL: t.url, AUDIT_HASH_KEY: key ?? undefined };
    if (key === null) delete env.AUDIT_HASH_KEY;
    return spawnSync(process.execPath, ["--import", "tsx", "bin/admin.ts", ...args], { cwd: pkg, env, encoding: "utf8", timeout: BUDGET });
  };
  const audit = () => withTenant(app, tenant, (tx) => tx.execute(sql`select action from core.audit_event where tenant_id = ${tenant} order by seq`));
  const chain = () => withTenant(app, tenant, (tx) => verifyAuditChain(tx, tenant, KEY));

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    tenant = run(["tenant-add", "Lumen Labs"], null).stdout.match(/tenant (\S+)/)![1];
    for (const [email, roles] of [["maya@lumen.test", "Admin,PM"], ["kasun@lumen.test", "Engineer"]])
      expect(run(["user-add", "--tenant", tenant, "--email", email, "--name", email, "--roles", roles], null).status).toBe(0);
  }, 4 * BUDGET);
  afterAll(() => t?.drop());

  it("AC-1 principal-add creates the principal, prints its token once and audits it on the chain", async () => {
    const r = run(["principal-add", "--tenant", tenant, "--email", "maya@lumen.test", "--name", "specclaw-sync", "--roles", "delivery:proposal:sync"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^principal \S+ {2}token \(shown once\): \S+\s*$/);
    expect((await audit()).length).toBeGreaterThan(0);
    expect(await chain()).toMatchObject({ ok: true });
  }, BUDGET);

  it("AC-2 user-deactivate deactivates the user and audits it", async () => {
    const before = (await audit()).length;
    const r = run(["user-deactivate", "--tenant", tenant, "--email", "kasun@lumen.test"]);
    expect(r.status, r.stderr).toBe(0);
    const [u] = await withTenant(app, tenant, (tx) => tx.execute(sql`select status from auth.user where email = 'kasun@lumen.test'`));
    expect(u.status).toBe("deactivated");
    expect((await audit()).length).toBeGreaterThan(before);
    expect(await chain()).toMatchObject({ ok: true });
  }, BUDGET);

  const audited = () => [["principal-add", "--tenant", tenant, "--email", "maya@lumen.test", "--name", "x", "--roles", "delivery:proposal:sync"], ["user-deactivate", "--tenant", tenant, "--email", "maya@lumen.test"]];

  it.each([
    [null, "set AUDIT_HASH_KEY (the deployment's audit key)"],
    ["", "AUDIT_HASH_KEY: at least 32 characters"],
    ["short-key", "AUDIT_HASH_KEY: at least 32 characters"],
  ])("AC-3 with the key %j, audited commands refuse and write nothing; the others still run unset", async (key, message) => {
    const before = (await audit()).length;
    for (const args of audited()) {
      const r = run(args, key);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain(message);
    }
    expect((await audit()).length).toBe(before);
    expect(run(["scim-token", "--tenant", tenant], null).status).toBe(0);
  }, 3 * BUDGET);

  it("AC-4 each command exits on its own", () => {
    for (const args of [...audited(), ["scim-token", "--tenant", tenant]]) {
      const r = run(args);
      expect(r.error).toBeUndefined();
      expect(r.signal).toBeNull();
    }
  }, 3 * BUDGET);
});
