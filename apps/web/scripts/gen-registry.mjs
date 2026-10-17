import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverModules, registrySource } from "../../../packages/core/src/registry.ts";

const here = dirname(fileURLToPath(import.meta.url));
const disabled = (process.env.AMAX_MODULES_DISABLED ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const names = discoverModules(join(here, "../../../modules"), disabled);
mkdirSync(join(here, "../generated"), { recursive: true });
writeFileSync(join(here, "../generated/modules.ts"), registrySource(names));
console.log(`registry: ${names.length ? names.join(", ") : "no modules"}`);
