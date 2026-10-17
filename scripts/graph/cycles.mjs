import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dirs } from "./scan.mjs";

export function findCycles(graph) {
  const cycles = [];
  const state = new Map();
  const visit = (n, stack) => {
    if (state.get(n) === 1) return cycles.push([...stack.slice(stack.indexOf(n)), n]);
    if (state.get(n) === 2) return;
    state.set(n, 1);
    for (const m of graph.get(n) ?? []) visit(m, [...stack, n]);
    state.set(n, 2);
  };
  for (const n of graph.keys()) visit(n, []);
  return cycles;
}

export function proposalGraph(root) {
  const ch = join(root, ".specclaw/changes");
  const g = new Map();
  for (const d of dirs(ch).filter((d) => /^\d{3}-/.test(d))) {
    const head = (readFileSync(join(ch, d, "change.md"), "utf8").split("\n")[3] ?? "").split("**Integrates with")[0];
    g.set(d.slice(0, 3), new Set((head.match(/\[(\d{3})\]/g) ?? []).map((x) => x.slice(1, 4))));
  }
  return g;
}
