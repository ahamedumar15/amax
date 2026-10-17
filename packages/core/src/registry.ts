import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function discoverModules(modulesDir: string, disabled: string[] = []) {
  if (!existsSync(modulesDir)) return [];
  return readdirSync(modulesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(modulesDir, d.name, "module.ts")))
    .map((d) => d.name)
    .filter((name) => !disabled.includes(name))
    .sort();
}

export function registrySource(names: string[]) {
  const imports = names.map((n, i) => `import m${i} from "@amax/${n}/module";`).join("\n");
  const list = names.map((_, i) => `m${i}`).join(", ");
  return `${imports}\n\nexport const modules = [${list}];\n`;
}
