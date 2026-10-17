import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { PLATFORM, importsOf, ownerOf } from "./scan.mjs";

function manifestDeps(root, mod) {
  const f = join(root, "modules", mod, "module.ts");
  if (!existsSync(f)) return null;
  const src = readFileSync(f, "utf8");
  const list = (key) => [...(src.match(new RegExp(`${key}\\s*[:=]\\s*\\[([^\\]]*)\\]`))?.[1] ?? "").matchAll(/['"]([\w-]+)['"]/g)].map((m) => m[1]);
  return new Set([...list("dependsOn"), ...list("integratesWith")]);
}

function checkRelative(ctx, owner, file, spec) {
  const base = join(ctx.root, "modules", owner.name);
  if (owner.kind === "module" && !resolve(file, "..", spec).startsWith(base)) {
    ctx.problems.push(`R2 ${relative(ctx.root, file)}: relative import "${spec}" leaves modules/${owner.name}/`);
  }
}

function checkModuleImport(ctx, owner, file, name, sub) {
  const rel = relative(ctx.root, file);
  ctx.addEdge(`${owner.kind}:${owner.name}`, `module:${name}`);
  if (owner.kind === "package") return ctx.problems.push(`R3 ${rel}: platform package imports module "@amax/${name}${sub}"`);
  if (name === owner.name) return;
  if (sub !== "/contracts") ctx.problems.push(`R1 ${rel}: import "@amax/${name}${sub}"; use "@amax/${name}/contracts"`);
  const declared = manifestDeps(ctx.root, owner.name);
  if (declared && !declared.has(name)) ctx.problems.push(`R4 ${rel}: imports module "${name}" but modules/${owner.name}/module.ts doesn't list it in dependsOn or integratesWith`);
}

export function checkFile(ctx, file) {
  const owner = ownerOf(ctx.root, file);
  if (!owner) return;
  for (const spec of importsOf(file)) {
    if (spec.startsWith(".")) { checkRelative(ctx, owner, file, spec); continue; }
    const m = spec.match(/^@amax\/([\w-]+)(\/.*)?$/);
    if (!m) continue;
    const [, name, sub = ""] = m;
    if (ctx.modules.has(name) && !PLATFORM.includes(name)) checkModuleImport(ctx, owner, file, name, sub);
    else if (ctx.packages.has(name) || PLATFORM.includes(name)) ctx.addEdge(`${owner.kind}:${owner.name}`, `package:${name}`);
  }
}
