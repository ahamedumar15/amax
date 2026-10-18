import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Tx } from "@amax/db";
import { hasDb, repoRoot, tablesMissingRls } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import { discoverModules } from "@amax/core/registry";
import { createRegistry } from "@amax/mcp";
import { latestChainChecks, listSubprocessors, pendingPolicies } from "../contracts";
import { exportEvidence } from "../server/evidence";
import { complianceDb, T } from "./db";

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);

describe("module standard", () => {
  it("AC7 can be switched off: nothing outside modules/compliance imports it", () => {
    expect(discoverModules(join(repoRoot, "modules"), ["compliance"])).not.toContain("compliance");
    const others = discoverModules(join(repoRoot, "modules")).filter((m) => m !== "compliance");
    expect(others.flatMap((m) => files(join(repoRoot, "modules", m))).filter((f) => readFileSync(f, "utf8").includes("@amax/compliance"))).toEqual([]);
  });
});

describe.skipIf(!hasDb)("AC7 contracts, RLS, and without learning (Postgres)", () => {
  let db: Awaited<ReturnType<typeof complianceDb>>;
  beforeAll(async () => {
    db = await complianceDb(["learning"]);
  }, 240_000);
  afterAll(() => db?.t.drop());

  it("AC7 every table has tenant RLS, and the contracts apply the reader's permissions and fail closed", async () => {
    expect((await tablesMissingRls(db.t.owner)).filter((t) => t.startsWith("compliance."))).toEqual([]);
    const job = contextFor.job(T, "test");
    const [dinesh, nimal, ravi] = [await db.as("dinesh"), await db.as("nimal"), await db.as("ravi")];
    const [person] = await db.q(sql`select id from hr.person where user_id = ${dinesh.userId}`);
    const tx = <R>(fn: (t: Tx) => Promise<R>) => withTenant(db.app, T, fn);
    expect((await tx((t) => pendingPolicies(t, dinesh, person.id as string))).map((p) => `${p.title} v${p.version}`)).toEqual(["Acceptable Use v4"]);
    expect(await tx((t) => pendingPolicies(t, job, person.id as string))).toHaveLength(1);
    await expect(tx((t) => pendingPolicies(t, nimal, person.id as string))).rejects.toThrow(/compliance:read/);
    expect((await tx((t) => latestChainChecks(t, ravi)))[0]).toMatchObject({ ok: true, source: "fixtures" });
    await expect(tx((t) => latestChainChecks(t, nimal))).rejects.toThrow(/forbidden/);
    expect((await tx((t) => listSubprocessors(t, job))).map((s) => s.name)).toEqual(expect.arrayContaining(["Anthropic", "Database host", "Northwind Payroll Bureau"]));
    const fake = { tenantId: T, actor: { id: "job:x", kind: "system" as const }, source: "job" as const };
    await expect(tx((t) => listSubprocessors(t, fake))).rejects.toThrow(/compliance:read/);
  }, 60_000);

  it("AC7 without learning installed, training evidence states the gap and everything else still works", async () => {
    expect(db.modules.map((m) => m.id)).not.toContain("learning");
    const o = (await createRegistry(db.modules).call(await db.as("sahan"), "get_compliance_overview", {}, { source: "mcp" })) as { controls: { control: string; status: string }[] };
    expect(o.controls.find((c) => c.control === "A.6.3")).toMatchObject({ status: "Needs Learning (024)" });
    const out = await exportEvidence(contextFor.job(T, "test"), { controls: ["A.6.3", "A.5.1"] });
    expect(out.bundles.map((b) => [b.control, b.available])).toEqual([["A.5.1", true], ["A.6.3", false]]);
  }, 60_000);
});
