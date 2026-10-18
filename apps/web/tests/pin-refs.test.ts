import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");
const sources = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (n === "node_modules" || n === "tests" || n.startsWith(".")) return [];
  return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(n) ? [p] : [];
});
const files = [...readdirSync(join(root, "modules")).map((m) => join(root, "modules", m)), join(root, "apps/web/app"), join(root, "apps/web/components")].flatMap(sources);

// Every PinRef written in a page or a pin builder: `tool: "name", args...` on one line.
const refs = files.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/tool: "([a-z_]+)", args\b([^\n]*)/g)].map((m) => ({ at: relative(root, f), tool: m[1], args: m[2] })));

// 059 AC-1: a pin names a record by its UUID, never by a name or key. The registry refuses a record
// tool with no UUID id path when it is built (packages/mcp/tests/pin-spec.test.ts); this checks the
// other half, that each pin on screen goes through such a tool and carries the id.
describe("059 AC1 every PinRef on screen resolves by id", { timeout: 30_000 }, () => {
  it("AC1 each pin's tool declares how it pins, and a record pin carries the record's id", async () => {
    const { toolRegistry } = await import("../lib/server");
    const tools = new Map(toolRegistry().all.map((t) => [t.name, t]));
    expect(refs.length).toBeGreaterThan(40);
    const wrong = refs.flatMap((r) => {
      const spec = tools.get(r.tool)?.pin;
      if (!spec) return [`${r.at}: ${r.tool} has no pin spec`];
      return spec !== "view" && !new RegExp(`\\b${spec.id}\\b`).test(r.args) ? [`${r.at}: ${r.tool} pinned without ${spec.id}`] : [];
    });
    expect(wrong).toEqual([]);
  });
});
