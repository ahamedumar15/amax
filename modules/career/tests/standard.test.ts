import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { hasDb, repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import { layoutTree } from "../layout/tree";
import type { Career } from "../server/queries";
import { careerDb } from "./db";
import { installedModules } from "./installed";

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);

describe.skipIf(!hasDb)("AC-8 module standard (Postgres)", () => {
  let db: Awaited<ReturnType<typeof careerDb>> | undefined;
  afterAll(() => db?.t.drop());

  it("AC8 can be switched off, and with hr alone the tree keeps its trunk and rings and says what is missing", async () => {
    expect(discoverModules(join(repoRoot, "modules"), ["career"])).not.toContain("career");
    const outside = [...readdirSync(join(repoRoot, "modules")).filter((m) => m !== "career").map((m) => join(repoRoot, "modules", m)), join(repoRoot, "packages"), join(repoRoot, "apps/web/app")].flatMap(files);
    expect(outside.filter((f) => /@amax\/career(?!\/contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
    expect((await installedModules(["career"])).map((m) => m.id)).not.toContain("career");

    db = await careerDb(discoverModules(join(repoRoot, "modules")).filter((m) => m !== "career" && m !== "hr"));
    expect(db.modules.map((m) => m.id).sort()).toEqual(["career", "hr"]);
    const c = (await db.call<Career>("maya", "get_career", { employeeNo: "LL-0417" }))!;
    const tree = layoutTree(c.events, c.today);
    expect([tree.rings.map((r) => r.grade), tree.branches.length, tree.fruit.length, tree.roots.length]).toEqual([["Associate Engineer", "Engineer", "Senior Engineer"], 0, 0, 4]);
    expect(c.notes).toEqual(["Allocations isn't installed, so projects aren't shown.", "Learning isn't installed, so certifications aren't shown.",
      "Delivery isn't installed, so clients and the agent's proposed technologies aren't shown."]);
  }, 240_000);
});
