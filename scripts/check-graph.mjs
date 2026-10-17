#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { findCycles, proposalGraph } from "./graph/cycles.mjs";
import { checkFile, checkTraceOrFail } from "./graph/rules.mjs";
import { dirs, ownerOf, walk } from "./graph/scan.mjs";

const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : undefined; };
const root = resolve(val("--root") ?? join(new URL(".", import.meta.url).pathname, ".."));
const edges = new Map();
const ctx = {
  root,
  modules: new Set(dirs(join(root, "modules"))),
  packages: new Set(dirs(join(root, "packages"))),
  problems: [],
  addEdge: (a, b) => { if (!edges.has(a)) edges.set(a, new Set()); edges.get(a).add(b); },
};

const one = val("--file");
if (one) {
  const f = resolve(one);
  if (/\.(m?[jt]sx?)$/.test(f) && existsSync(f)) {
    if (ownerOf(root, f)) checkFile(ctx, f);
    checkTraceOrFail(ctx, f);
  }
} else {
  for (const kind of ["modules", "packages"]) for (const d of dirs(join(root, kind))) for (const f of walk(join(root, kind, d))) checkFile(ctx, f);
  for (const kind of ["modules", "packages", "apps"]) for (const f of walk(join(root, kind))) checkTraceOrFail(ctx, f);
  for (const c of findCycles(edges)) ctx.problems.push(`R5 cycle: ${c.join(" → ")}`);
  for (const c of findCycles(proposalGraph(root))) ctx.problems.push(`R6 proposal cycle: ${c.join(" → ")}`);
}

if (args.includes("--graph")) {
  const lines = [...edges].flatMap(([a, bs]) => [...bs].map((b) => `  ${a.replace(":", "_")} --> ${b.replace(":", "_")}`));
  const props = [...proposalGraph(root)].flatMap(([a, bs]) => [...bs].map((b) => `  P${b} --> P${a}`));
  console.log(["```mermaid", "graph LR", ...lines, "```", "", "```mermaid", "graph LR", ...props, "```"].join("\n"));
}

const problems = [...new Set(ctx.problems)];
if (problems.length) {
  console.error(`amax graph check: ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join("\n")}\nSee docs/module-standard.md.`);
  process.exit(2);
}
if (!one && !args.includes("--graph")) console.log(`amax graph check: ok (${ctx.modules.size} modules, ${ctx.packages.size} packages)`);
