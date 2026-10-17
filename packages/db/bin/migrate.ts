import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { migrate, migrationScopes } from "../src/migrate";

const url = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("amax: set DATABASE_MIGRATE_URL (the schema owner) to run migrations");
  process.exit(1);
}
const root = join(fileURLToPath(import.meta.url), "../../../..");
const disabled = (process.env.AMAX_MODULES_DISABLED ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const n = await migrate(sql, migrationScopes(root, disabled), console.log);
  console.log(n ? `migrations: ${n} applied` : "migrations: up to date");
} finally {
  await sql.end();
}
