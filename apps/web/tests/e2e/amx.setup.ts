import { test } from "@playwright/test";
import { importAmx } from "./global-auth";

// 039's AMX import, after the visual test (041) and before the specs that expect AMX.
test("import amax's own specs as project AMX", async () => {
  await importAmx(process.env.DATABASE_MIGRATE_URL ?? "postgres://amax:amax@127.0.0.1:5440/amax");
});
