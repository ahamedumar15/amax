import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import { isRole, type Role } from "./roles";
import { openSession, SignInDenied } from "./session";

const scrypt = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(pw, salt, len, opts, (e, k) => (e ? reject(e) : resolve(k))));

const N = 2 ** 15, R = 8, P = 1, LEN = 32;
const opts = (n: number, r: number, p: number) => ({ N: n, r, p, maxmem: 128 * n * r * 2 });

export const MIN_PASSWORD = 12;
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;

// Format: scrypt$N$r$p$salt$hash (base64).
export async function hashPassword(password: string) {
  if (password.length < MIN_PASSWORD) throw new Error(`password must be at least ${MIN_PASSWORD} characters`);
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, LEN, opts(N, R, P));
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !hash) return false;
  const want = Buffer.from(hash, "base64");
  const got = await scrypt(password, Buffer.from(salt, "base64"), want.length, opts(Number(n), Number(r), Number(p)));
  return timingSafeEqual(got, want);
}

// Unknown emails still pay for a hash, so response time doesn't reveal which accounts exist.
let dummy: Promise<string> | undefined;

export async function signInPassword(db: Db, tenantId: string, email: string, password: string) {
  // A wrong password must commit its failure count, so the denial is thrown after the transaction.
  const out = await withTenant(db, tenantId, async (tx) => {
    const [u] = await tx.execute(sql`select id, status, password_hash, locked_until > now() as locked from auth.user where email = ${email.trim().toLowerCase()}`);
    if (!u?.password_hash) {
      await verifyPassword(password, await (dummy ??= hashPassword(randomBytes(18).toString("base64"))));
      throw new SignInDenied("bad-credentials");
    }
    if (u.locked) throw new SignInDenied("locked");
    if (!(await verifyPassword(password, u.password_hash as string))) {
      await tx.execute(sql`update auth.user set failed_logins = failed_logins + 1,
        locked_until = case when failed_logins + 1 >= ${MAX_FAILURES} then now() + make_interval(mins => ${LOCK_MINUTES}) end where id = ${u.id}`);
      return null;
    }
    if (u.status !== "active") throw new SignInDenied("deactivated");
    const roles = (await tx.execute(sql`select role from auth.role_assignment where user_id = ${u.id}`)).map((r) => r.role as string).filter(isRole);
    if (!roles.length) throw new SignInDenied("no-role");
    await tx.execute(sql`update auth.user set failed_logins = 0, locked_until = null where id = ${u.id}`);
    return openSession(tx, tenantId, u.id as string, roles);
  });
  if (!out) throw new SignInDenied("bad-credentials");
  return out;
}

// Admin CLI and tests: create or update a password user with roles.
export async function upsertPasswordUser(db: Db, tenantId: string, user: { email: string; name: string; roles: Role[]; password: string }) {
  const hash = await hashPassword(user.password);
  return withTenant(db, tenantId, async (tx) => {
    const [u] = await tx.execute(sql`insert into auth.user (tenant_id, email, name, password_hash)
      values (${tenantId}, ${user.email.trim().toLowerCase()}, ${user.name}, ${hash})
      on conflict (tenant_id, email) do update set name = excluded.name, password_hash = excluded.password_hash, failed_logins = 0, locked_until = null, updated_at = now()
      returning id`);
    for (const role of user.roles) {
      await tx.execute(sql`insert into auth.role_assignment (tenant_id, user_id, role, source) values (${tenantId}, ${u.id}, ${role}, 'manual') on conflict do nothing`);
    }
    return u.id as string;
  });
}
