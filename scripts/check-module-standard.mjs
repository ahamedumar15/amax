#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const at = args.indexOf("--root");
const root = resolve(at > -1 ? args[at + 1] : join(new URL(".", import.meta.url).pathname, ".."));
const modulesDir = join(root, "modules");
const owners = existsSync(join(root, ".github/CODEOWNERS")) ? readFileSync(join(root, ".github/CODEOWNERS"), "utf8") : "";
const REQUIRED = ["module.ts", "README.md", "contracts.ts", "fixtures", "tests", "package.json"];

const names = existsSync(modulesDir) ? readdirSync(modulesDir).filter((d) => statSync(join(modulesDir, d)).isDirectory()) : [];
const problems = names.flatMap((name) => [
  ...REQUIRED.filter((f) => !existsSync(join(modulesDir, name, f))).map((f) => `modules/${name}: missing ${f}`),
  ...(new RegExp(`^/modules/${name}/\\s+\\S`, "m").test(owners) ? [] : [`modules/${name}: no CODEOWNERS line for /modules/${name}/`]),
]);

if (problems.length) {
  console.error(`module standard: ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join("\n")}\nSee docs/module-standard.md.`);
  process.exit(2);
}
console.log(`module standard: ok (${names.length} modules)`);
