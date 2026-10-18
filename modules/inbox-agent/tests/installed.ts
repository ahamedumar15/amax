import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ModuleManifest } from "@amax/core";
import { discoverModules } from "@amax/core/registry";
import { repoRoot } from "@amax/db/testdb";

export async function installedModules(disabled: string[] = []): Promise<ModuleManifest[]> {
  const names = discoverModules(join(repoRoot, "modules"), disabled);
  return Promise.all(names.map(async (n) => (await import(pathToFileURL(join(repoRoot, "modules", n, "module.ts")).href)).default as ModuleManifest));
}
