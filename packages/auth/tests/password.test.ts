import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { hashPassword, MAX_FAILURES, signInPassword, upsertPasswordUser, verifyPassword } from "../src/password";
import { loadViewer, SignInDenied } from "../src/session";
import { revokeUser } from "../src/revoke";

const T = "cccccccc-0000-4000-8000-00000000000c";
const reason = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof SignInDenied ? e.reason : String(e)));

describe("password hashing", () => {
  it("salts, verifies and refuses short passwords", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("correct horse batterY", a)).toBe(false);
    await expect(hashPassword("short")).rejects.toThrow(/at least 12/);
  });
});

describe.skipIf(!hasDb)("password sign-in", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    await t.owner`insert into core.tenant (id, name) values (${T}, 'Hosted')`;
    await upsertPasswordUser(app, T, { email: "Maya@Lumen.test", name: "Maya Fernando", roles: ["Admin", "PM"], password: "maya-password-123" });
    await upsertPasswordUser(app, T, { email: "kasun@lumen.test", name: "Kasun Dias", roles: ["Engineer"], password: "kasun-password-123" });
  });
  afterAll(() => t?.drop());

  it("signs in with email (any case) and password, with the user's roles", async () => {
    const s = await signInPassword(app, T, " maya@lumen.TEST ", "maya-password-123");
    expect((await loadViewer(app, T, s.sessionId))?.actualRoles.sort()).toEqual(["Admin", "PM"]);
  });

  it("wrong password and unknown email look the same", async () => {
    expect(await reason(signInPassword(app, T, "maya@lumen.test", "nope-nope-nope"))).toBe("bad-credentials");
    expect(await reason(signInPassword(app, T, "nobody@lumen.test", "whatever-whatever"))).toBe("bad-credentials");
  });

  it(`locks after ${MAX_FAILURES} failures, even for the right password`, async () => {
    for (let i = 0; i < MAX_FAILURES; i++) await signInPassword(app, T, "kasun@lumen.test", "wrong-wrong-wrong").catch(() => {});
    expect(await reason(signInPassword(app, T, "kasun@lumen.test", "kasun-password-123"))).toBe("locked");
    await withTenant(app, T, (tx) => tx.execute(sql`update auth.user set locked_until = now() - interval '1 second' where email = 'kasun@lumen.test'`));
    expect(await reason(signInPassword(app, T, "kasun@lumen.test", "kasun-password-123"))).toBe("ok");
  }, 30_000);

  it("a deactivated user can't sign in and their session stops loading", async () => {
    const s = await signInPassword(app, T, "maya@lumen.test", "maya-password-123");
    await revokeUser(app, T, s.userId, { deactivate: true, reason: "test" });
    expect(await loadViewer(app, T, s.sessionId)).toBeNull();
    expect(await reason(signInPassword(app, T, "maya@lumen.test", "maya-password-123"))).toBe("deactivated");
  });

  it("stores only the hash", async () => {
    const rows = await t.owner`select password_hash from auth.user`;
    expect(JSON.stringify(rows)).not.toContain("password-123");
  });
});
