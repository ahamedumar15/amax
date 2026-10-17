#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const at = args.indexOf("--root");
const root = resolve(at > -1 ? args[at + 1] : join(new URL(".", import.meta.url).pathname, ".."));
const modulesDir = join(root, "modules");
const owners = existsSync(join(root, ".github/CODEOWNERS")) ? readFileSync(join(root, ".github/CODEOWNERS"), "utf8") : "";
const REQUIRED = ["module.ts", "README.md", "contracts.ts", "fixtures", "tests", "package.json"];

const PERSONAL = /^(initials|[a-z_]*_name|[a-z_]*email[a-z_]*|phone[a-z_]*|[a-z_]+_by|by_actor|[a-z_]*user_id|[a-z_]*person_id|note|[a-z_]+_note|comment|[a-z_]+_comment|base_salary|epf_number|bank_[a-z_]+|acts_for)$/;
const PSEUDONYMOUS = /(^|_)(user|person)_id$/;

function personalTables(name) {
  const dir = join(modulesDir, name, "db/migrations");
  if (!existsSync(dir)) return [];
  const found = new Set();
  const note = (table, column) => PERSONAL.test(column) && !PSEUDONYMOUS.test(column) && found.add(table);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
    const src = readFileSync(join(dir, f), "utf8");
    for (const t of src.matchAll(/create table ([a-z_]+\.[a-z_]+) \(([\s\S]*?)\n\);/g)) for (const c of t[2].matchAll(/^\s+([a-z_]+) /gm)) note(t[1], c[1]);
    for (const a of src.matchAll(/alter table ([a-z_]+\.[a-z_]+)([^;]*);/g)) for (const c of a[2].matchAll(/add column (?:if not exists )?([a-z_]+)/g)) note(a[1], c[1]);
  }
  return [...found];
}

function unretained(name) {
  const manifest = existsSync(join(modulesDir, name, "module.ts")) ? readFileSync(join(modulesDir, name, "module.ts"), "utf8") : "";
  return personalTables(name).filter((t) => !manifest.includes(`table: "${t}"`)).map((t) => `modules/${name}: personal-data table ${t} has no retention entry (032)`);
}

const names = existsSync(modulesDir) ? readdirSync(modulesDir).filter((d) => statSync(join(modulesDir, d)).isDirectory()) : [];
const problems = names.flatMap((name) => [
  ...REQUIRED.filter((f) => !existsSync(join(modulesDir, name, f))).map((f) => `modules/${name}: missing ${f}`),
  ...unretained(name),
  ...(new RegExp(`^/modules/${name}/\\s+\\S`, "m").test(owners) ? [] : [`modules/${name}: no CODEOWNERS line for /modules/${name}/`]),
]);

if (problems.length) {
  console.error(`module standard: ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join("\n")}\nSee docs/module-standard.md.`);
  process.exit(2);
}
console.log(`module standard: ok (${names.length} modules)`);
