import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import manifest from "../module";

const root = join(import.meta.dirname, "..");
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []));

describe("module standard and chat-first", () => {
  it("AC1 can be switched off: nothing outside modules/notifications imports it, and no module sends a message itself", () => {
    expect(discoverModules(join(repoRoot, "modules"), ["notifications"])).not.toContain("notifications");
    const outside = [...readdirSync(join(repoRoot, "modules")).filter((m) => m !== "notifications").flatMap((m) => files(join(repoRoot, "modules", m))), ...files(join(repoRoot, "apps/web/lib")), ...files(join(repoRoot, "apps/web/app"))];
    expect(outside.filter((f) => /@amax\/notifications|sendMail|webhook\.office\.com/.test(readFileSync(f, "utf8")))).toEqual([]);
  });

  it("AC6 the bell and the page have no form or write, and every pin names a read tool the module has", () => {
    expect(existsSync(join(root, "actions.ts"))).toBe(false);
    const reads = new Set((manifest.mcpTools ?? []).filter((t) => t.readOnly).map((t) => t.name));
    for (const f of files(join(root, "ui"))) {
      const src = readFileSync(f, "utf8");
      expect([f, /<form|<dialog|<input|from "\.\.\/server\/(prefs|notify|record)"/.test(src)]).toEqual([f, false]);
      for (const [, tool] of src.matchAll(/tool: "([a-z_]+)"/g)) expect([f, tool, reads.has(tool)]).toEqual([f, tool, true]);
    }
    expect(readFileSync(join(root, "ui/poll.ts"), "utf8")).not.toMatch(/prefs|notify|update|insert|delete/);
  });
});
