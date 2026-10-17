import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { entraIssuer } from "../src/seed";
import { loadViewer, signInFromDirectory, SignInDenied, type DirectoryClaims } from "../src/session";

const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const claims = (dir: string, groups: string[], oid = "oid-1"): DirectoryClaims => ({
  issuer: entraIssuer(dir), directoryId: dir, externalId: oid, email: `${oid}@x.test`, name: oid, groups,
});
const reason = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof SignInDenied ? e.reason : String(e)));

describe.skipIf(!hasDb)("AC-7 / AC-2 sign-in rules", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    await t.owner`insert into core.tenant (id, name) values (${A}, 'Lumen Labs'), (${B}, 'Other Co')`;
    for (const [tenant, dir] of [[A, "dir-a"], [B, "dir-b"]]) {
      await t.owner`insert into auth.identity_provider (tenant_id, issuer, directory_id, client_id, client_secret_ref) values (${tenant}, ${entraIssuer(dir)}, ${dir}, 'c', 'env:X')`;
      await t.owner`insert into auth.role_mapping (tenant_id, group_id, role) values (${tenant}, 'g-eng', 'Engineer'), (${tenant}, 'g-pm', 'PM'), (${tenant}, 'g-pm', 'Leadership')`;
    }
  });
  afterAll(() => t?.drop());

  it("signs in, maps groups to roles and opens a session", async () => {
    const s = await signInFromDirectory(app, claims("dir-a", ["g-pm", "unrelated"]), A);
    expect(s.tenantId).toBe(A);
    const v = await loadViewer(app, A, s.sessionId);
    expect(v?.actualRoles.sort()).toEqual(["Leadership", "PM"]);
  });

  it("a user in no mapped group is denied", async () => {
    expect(await reason(signInFromDirectory(app, claims("dir-a", ["unrelated"], "oid-2"), A))).toBe("no-role");
  });

  it("the tenant comes from the token's directory: B's user can't sign in through A", async () => {
    expect(await reason(signInFromDirectory(app, claims("dir-b", ["g-eng"], "oid-b"), A))).toBe("wrong-tenant");
    expect(await reason(signInFromDirectory(app, claims("dir-b", ["g-eng"], "oid-b"), B))).toBe("ok");
    expect(await reason(signInFromDirectory(app, claims("dir-unknown", ["g-eng"]), A))).toBe("unknown-directory");
  });

  it("a forged issuer for a known directory id is unknown", async () => {
    const forged = { ...claims("dir-a", ["g-eng"]), issuer: "https://evil.example/dir-a/v2.0" };
    expect(await reason(signInFromDirectory(app, forged, A))).toBe("unknown-directory");
  });

  it("group changes update roles on the next sign-in; manual roles stay", async () => {
    const s1 = await signInFromDirectory(app, claims("dir-a", ["g-pm"], "oid-3"), A);
    const uid = s1.userId;
    await withTenant(app, A, (tx) => tx.execute(sql`insert into auth.role_assignment (tenant_id, user_id, role, source) values (${A}, ${uid}, 'Finance', 'manual')`));
    const s2 = await signInFromDirectory(app, claims("dir-a", ["g-eng"], "oid-3"), A);
    expect((await loadViewer(app, A, s2.sessionId))?.actualRoles.sort()).toEqual(["Engineer", "Finance"]);
  });

  it("a deactivated user can't sign in, and their open session stops loading", async () => {
    const s = await signInFromDirectory(app, claims("dir-a", ["g-eng"], "oid-4"), A);
    await withTenant(app, A, (tx) => tx.execute(sql`update auth.user set status = 'deactivated' where id = ${s.userId}`));
    expect(await loadViewer(app, A, s.sessionId)).toBeNull();
    expect(await reason(signInFromDirectory(app, claims("dir-a", ["g-eng"], "oid-4"), A))).toBe("deactivated");
  });

  it("sign-ins are audited", async () => {
    const rows = await withTenant(app, A, (tx) => tx.execute(sql`select count(*)::int as n from core.audit_event where action = 'auth.signin'`));
    expect(rows[0].n).toBeGreaterThanOrEqual(4);
  });
});
