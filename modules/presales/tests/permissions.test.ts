import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import { ForbiddenError } from "@amax/core/server";
import { ctxFor } from "../server/context";
import { createOpportunity, moveOpportunity } from "../server/opportunities";
import { listOpportunities } from "../server/queries";
import { presalesDb } from "./db";

describe("AC-4 module standard", () => {
  it("can be switched off: nothing outside modules/presales imports it but through its contracts", () => {
    expect(discoverModules(join(repoRoot, "modules"), ["presales"])).not.toContain("presales");
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);
    const outside = readdirSync(join(repoRoot, "modules")).filter((m) => m !== "presales").flatMap((m) => files(join(repoRoot, "modules", m)));
    expect(outside.filter((f) => /@amax\/presales(?!\/contracts")/.test(readFileSync(f, "utf8")))).toEqual([]);
  });
});

describe.skipIf(!hasDb)("AC-4 permissions (Postgres)", () => {
  let db: Awaited<ReturnType<typeof presalesDb>>;
  beforeAll(async () => { db = await presalesDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("Sales sells, Leadership and PMs read, engineers see nothing", async () => {
    const [liam, sarah, maya, nimal] = [await db.as("liam"), await db.as("sarah"), await db.as("maya", "PM"), await db.as("nimal")];
    const today = "2026-10-16";
    expect((await listOpportunities(sarah, today)).length).toBeGreaterThan(5);
    expect((await listOpportunities(maya, today)).length).toBeGreaterThan(5);
    await expect(listOpportunities(nimal, today)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(moveOpportunity(ctxFor(sarah), { number: "PS-0137", to: "won" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createOpportunity(ctxFor(maya), { client: "A", title: "B", value: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await createOpportunity(ctxFor(liam), { client: "A", title: "B", value: 1 })).toMatchObject({ number: "PS-0143" });
  });
});
