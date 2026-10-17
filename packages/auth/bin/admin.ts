// Admin CLI for deployments without an identity provider. Runs as the schema owner.
//   pnpm --filter @amax/auth admin tenant-add "Lumen Labs"
//   pnpm --filter @amax/auth admin user-add --tenant <id> --email a@b.c --name "A B" --roles Admin,PM [--password ...]
//   pnpm --filter @amax/auth admin user-deactivate --tenant <id> --email a@b.c
// Without --password a strong one is generated and printed once.
import { randomBytes, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { sql } from "drizzle-orm";
import { createDb, withTenant } from "@amax/db";
import { upsertPasswordUser } from "../src/password";
import { revokeUser } from "../src/revoke";
import { isRole } from "../src/roles";

const url = process.env.DATABASE_MIGRATE_URL;
if (!url) throw new Error("set DATABASE_MIGRATE_URL (the schema owner)");
const [cmd, ...rest] = process.argv.slice(2);
const { values, positionals } = parseArgs({
  args: rest,
  allowPositionals: true,
  options: { tenant: { type: "string" }, email: { type: "string" }, name: { type: "string" }, roles: { type: "string" }, password: { type: "string" } },
});
const { db, client } = createDb(url, { max: 1 });
const need = (k: keyof typeof values) => values[k] ?? (() => { throw new Error(`--${k} is required`); })();

try {
  if (cmd === "tenant-add") {
    const id = randomUUID();
    const name = positionals[0] ?? (() => { throw new Error("tenant name is required"); })();
    await withTenant(db, id, (tx) => tx.execute(sql`insert into core.tenant (id, name) values (${id}, ${name})`));
    console.log(`tenant ${id}  (set AMAX_AUTH_PASSWORD_TENANT=${id})`);
  } else if (cmd === "user-add") {
    const roles = need("roles").split(",").map((r) => r.trim());
    const bad = roles.filter((r) => !isRole(r));
    if (bad.length) throw new Error(`unknown roles: ${bad.join(", ")}`);
    const password = values.password ?? randomBytes(15).toString("base64url");
    const id = await upsertPasswordUser(db, need("tenant"), { email: need("email"), name: need("name"), roles: roles as never, password });
    console.log(`user ${id}${values.password ? "" : `  password: ${password}  (shown once)`}`);
  } else if (cmd === "user-deactivate") {
    const tenantId = need("tenant");
    const [u] = await withTenant(db, tenantId, (tx) => tx.execute(sql`select id from auth.user where email = ${need("email").toLowerCase()}`));
    if (!u) throw new Error("no such user");
    await revokeUser(db, tenantId, u.id as string, { deactivate: true, reason: "admin-cli" });
    console.log(`deactivated ${u.id}`);
  } else {
    console.error("commands: tenant-add <name> | user-add --tenant --email --name --roles [--password] | user-deactivate --tenant --email");
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
