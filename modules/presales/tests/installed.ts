import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ModuleManifest } from "@amax/core";
import { discoverModules } from "@amax/core/registry";
import { repoRoot } from "@amax/db/testdb";

// The installed modules, loaded by path as the app's generated registry would (so tests never import
// another module's internals by name).
export async function installedModules(disabled: string[] = []): Promise<ModuleManifest[]> {
  const names = discoverModules(join(repoRoot, "modules"), disabled);
  return Promise.all(names.map(async (n) => (await import(pathToFileURL(join(repoRoot, "modules", n, "module.ts")).href)).default as ModuleManifest));
}
