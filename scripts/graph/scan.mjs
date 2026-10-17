import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const PLATFORM = ["core", "db", "auth", "ui", "mcp", "chat", "agents", "workflows", "testing"];

export const dirs = (p) => (existsSync(p) ? readdirSync(p).filter((d) => statSync(join(p, d)).isDirectory()) : []);

export function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".") || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(m?[jt]sx?)$/.test(name)) yield p;
  }
}

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;

export const importsOf = (file) => [...readFileSync(file, "utf8").matchAll(IMPORT_RE)].map((m) => m[1] || m[2] || m[3] || m[4]);

export function ownerOf(root, file) {
  const rel = relative(root, file).split(sep);
  if (rel[0] === "modules" && rel[1] && rel.length > 2) return { kind: "module", name: rel[1] };
  if (rel[0] === "packages" && rel[1] && rel.length > 2) return { kind: "package", name: rel[1] };
  return null;
}
