import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { freshDatabase, hasDb, migrate, migrationScopes } from "@amax/db";

export { hasDb };
export const repoRoot = join(fileURLToPath(import.meta.url), "../../../..");

// A throwaway database with core and every installed module migrated.
export async function migratedDatabase() {
  const t = await freshDatabase();
  await migrate(t.owner, migrationScopes(repoRoot));
  return t;
}
