import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type postgres from "postgres";

export type Scope = { name: string; dir: string };

const list = (src: string, key: string) =>
  [...(src.match(new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`))?.[1] ?? "").matchAll(/['"]([\w-]+)['"]/g)].map((m) => m[1]);

// Core first, then modules with migrations in manifest dependency order (dependsOn), ties by name.
export function migrationScopes(root: string, disabled: string[] = []): Scope[] {
  const modulesDir = join(root, "modules");
  const mods = existsSync(modulesDir)
    ? readdirSync(modulesDir).filter((m) => !disabled.includes(m) && existsSync(join(modulesDir, m, "db/migrations"))).sort()
    : [];
  const deps = new Map(mods.map((m) => [m, list(readFileSync(join(modulesDir, m, "module.ts"), "utf8"), "dependsOn").filter((d) => mods.includes(d))]));
  const ordered: string[] = [];
  const visit = (m: string, path: string[] = []) => {
    if (ordered.includes(m)) return;
    if (path.includes(m)) throw new Error(`migration order: dependency cycle ${[...path, m].join(" → ")}`);
    for (const d of deps.get(m) ?? []) visit(d, [...path, m]);
    ordered.push(m);
  };
  mods.forEach((m) => visit(m));
  return [{ name: "core", dir: join(root, "packages/db/migrations") }, ...ordered.map((m) => ({ name: m, dir: join(modulesDir, m, "db/migrations") }))];
}

const checksum = (s: string) => createHash("sha256").update(s).digest("hex");

// Applies pending *.sql files per scope, each in its own transaction. Applied files are keyed by
// (scope, file), so two modules adding migrations in parallel never collide; editing an applied file fails.
export async function migrate(sql: postgres.Sql, scopes: Scope[], log: (line: string) => void = () => {}) {
  await sql`create schema if not exists amax_migrations`;
  await sql`create table if not exists amax_migrations.applied (
    scope text not null, file text not null, checksum text not null, applied_at timestamptz not null default now(),
    primary key (scope, file))`;
  let count = 0;
  for (const scope of scopes) {
    if (!existsSync(scope.dir)) continue;
    const done = new Map((await sql`select file, checksum from amax_migrations.applied where scope = ${scope.name}`).map((r) => [r.file, r.checksum]));
    for (const file of readdirSync(scope.dir).filter((f) => f.endsWith(".sql")).sort()) {
      const body = readFileSync(join(scope.dir, file), "utf8");
      const sum = checksum(body);
      if (done.has(file)) {
        if (done.get(file) !== sum) throw new Error(`migration ${scope.name}/${file} changed after it was applied; add a new file instead`);
        continue;
      }
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into amax_migrations.applied (scope, file, checksum) values (${scope.name}, ${file}, ${sum})`;
      });
      log(`applied ${scope.name}/${file}`);
      count++;
    }
  }
  return count;
}
