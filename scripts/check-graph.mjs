#!/usr/bin/env node
// Lightweight dependency and boundary checker for the amax monorepo. No dependencies.
//
//   node scripts/check-graph.mjs              full check (modules, packages, proposals)
//   node scripts/check-graph.mjs --file <p>   check one file's imports (used by the Claude Code edit hook)
//   node scripts/check-graph.mjs --graph      print the module and proposal graphs as Mermaid
//
// Rules (docs/module-standard.md):
//   R1  a module imports another module only through `@amax/<other>/contracts`
//   R2  a module never reaches outside its folder with relative imports
//   R3  platform packages (packages/*) never import a module
//   R4  a module's imports of other modules are declared in its manifest
//       (`dependsOn` or `integratesWith` in module.ts)
//   R5  no cycles between modules or packages
//   R6  no cycles between specclaw proposals' hard dependencies
// Exit 0 = clean, 2 = violations (Claude Code hooks treat 2 as "blocked, show stderr").
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const PLATFORM = ["core", "db", "auth", "ui", "mcp", "chat", "agents", "workflows", "testing"];
const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const val = (k) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : undefined; };

const dirs = (p) => (existsSync(p) ? readdirSync(p).filter((d) => statSync(join(p, d)).isDirectory()) : []);
const modules = new Set(dirs(join(ROOT, "modules")));
const packages = new Set(dirs(join(ROOT, "packages")));

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".") || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(m?[jt]sx?)$/.test(name)) yield p;
  }
}

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;
const importsOf = (file) => [...readFileSync(file, "utf8").matchAll(IMPORT_RE)].map((m) => m[1] || m[2] || m[3] || m[4]);

function ownerOf(file) {
  const rel = relative(ROOT, file).split(sep);
  if (rel[0] === "modules" && rel[1]) return { kind: "module", name: rel[1] };
  if (rel[0] === "packages" && rel[1]) return { kind: "package", name: rel[1] };
  return null;
}

function manifestDeps(mod) {
  const f = join(ROOT, "modules", mod, "module.ts");
  if (!existsSync(f)) return null;
  const src = readFileSync(f, "utf8");
  const list = (key) => [...(src.match(new RegExp(`${key}\\s*[:=]\\s*\\[([^\\]]*)\\]`))?.[1] ?? "").matchAll(/['"]([\w-]+)['"]/g)].map((m) => m[1]);
  return new Set([...list("dependsOn"), ...list("integratesWith")]);
}

const problems = [];
const edges = new Map(); // "module:hr" -> Set("module:leave", "package:core")
const addEdge = (a, b) => { if (!edges.has(a)) edges.set(a, new Set()); edges.get(a).add(b); };

function checkFile(file) {
  const owner = ownerOf(file);
  if (!owner) return;
  const from = `${owner.kind}:${owner.name}`;
  const rel = relative(ROOT, file);
  for (const spec of importsOf(file)) {
    if (spec.startsWith(".")) {
      const target = resolve(file, "..", spec);
      const base = join(ROOT, owner.kind === "module" ? "modules" : "packages", owner.name);
      if (owner.kind === "module" && !target.startsWith(base)) problems.push(`R2 ${rel}: relative import "${spec}" leaves modules/${owner.name}/`);
      continue;
    }
    const m = spec.match(/^@amax\/([\w-]+)(\/.*)?$/);
    if (!m) continue;
    const [, name, sub = ""] = m;
    if (modules.has(name) && !PLATFORM.includes(name)) {
      addEdge(from, `module:${name}`);
      if (owner.kind === "package") problems.push(`R3 ${rel}: platform package imports module "${spec}"`);
      else if (name !== owner.name) {
        if (sub !== "/contracts") problems.push(`R1 ${rel}: import "${spec}"; use "@amax/${name}/contracts"`);
        const declared = manifestDeps(owner.name);
        if (declared && !declared.has(name)) problems.push(`R4 ${rel}: imports module "${name}" but modules/${owner.name}/module.ts doesn't list it in dependsOn or integratesWith`);
      }
    } else if (packages.has(name) || PLATFORM.includes(name)) {
      addEdge(from, `package:${name}`);
    }
  }
}

function findCycles(graph) {
  const cycles = []; const state = new Map();
  const visit = (n, stack) => {
    if (state.get(n) === 1) { cycles.push([...stack.slice(stack.indexOf(n)), n]); return; }
    if (state.get(n) === 2) return;
    state.set(n, 1);
    for (const m of graph.get(n) ?? []) visit(m, [...stack, n]);
    state.set(n, 2);
  };
  for (const n of graph.keys()) visit(n, []);
  return cycles;
}

function proposalGraph() {
  const CH = join(ROOT, ".specclaw/changes");
  const g = new Map(); const names = new Map();
  for (const d of dirs(CH).filter((d) => /^\d{3}-/.test(d))) {
    const head = (readFileSync(join(CH, d, "change.md"), "utf8").split("\n")[3] ?? "").split("**Integrates with")[0];
    g.set(d.slice(0, 3), new Set((head.match(/\[(\d{3})\]/g) ?? []).map((x) => x.slice(1, 4))));
    names.set(d.slice(0, 3), d);
  }
  return { g, names };
}

// ---- run ----
const one = val("--file");
if (one) {
  const f = resolve(one);
  if (ownerOf(f) && /\.(m?[jt]sx?)$/.test(f) && existsSync(f)) checkFile(f);
} else {
  for (const m of modules) for (const f of walk(join(ROOT, "modules", m))) checkFile(f);
  for (const p of packages) for (const f of walk(join(ROOT, "packages", p))) checkFile(f);
  for (const c of findCycles(edges)) problems.push(`R5 cycle: ${c.join(" → ")}`);
  const { g } = proposalGraph();
  for (const c of findCycles(g)) problems.push(`R6 proposal cycle: ${c.join(" → ")}`);
}

if (flag("--graph")) {
  console.log("```mermaid\ngraph LR");
  for (const [a, bs] of edges) for (const b of bs) console.log(`  ${a.replace(":", "_")} --> ${b.replace(":", "_")}`);
  console.log("```\n\n```mermaid\ngraph LR");
  const { g } = proposalGraph();
  for (const [a, bs] of g) for (const b of bs) console.log(`  P${b} --> P${a}`);
  console.log("```");
}

const unique = [...new Set(problems)];
if (unique.length) {
  problems.length = 0; problems.push(...unique);
  console.error(`amax graph check: ${problems.length} problem(s)\n` + problems.map((p) => `  - ${p}`).join("\n") + "\nSee docs/module-standard.md.");
  process.exit(2);
}
if (!one && !flag("--graph")) console.log(`amax graph check: ok (${modules.size} modules, ${packages.size} packages)`);
