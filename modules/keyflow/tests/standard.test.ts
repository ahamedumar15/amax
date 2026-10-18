import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { hasDb, repoRoot } from "@amax/db/testdb";
import { discoverModules } from "@amax/core/registry";
import { createPostgresEngine, getRun, workflowRegistry } from "@amax/workflows/server";
import manifest from "../module";
import { EVENTS } from "../contracts";
import { setTestTransport } from "../server/sync";
import { keyflowDb, T } from "./db";
import { fakeKeyflow } from "./fake";

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === "node_modules" ? [] : files(join(dir, d.name))) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);
const others = (keep: string[]) => discoverModules(join(repoRoot, "modules")).filter((m) => !keep.includes(m));

describe("module standard", () => {
  it("AC3 can be switched off, declares its events, workflow and schedule, and depends only on hr", () => {
    expect(discoverModules(join(repoRoot, "modules"), ["keyflow"])).not.toContain("keyflow");
    expect(others(["keyflow"]).flatMap((m) => files(join(repoRoot, "modules", m))).filter((f) => readFileSync(f, "utf8").includes("@amax/keyflow"))).toEqual([]);
    expect(manifest).toMatchObject({ id: "keyflow", group: "Operations", dependsOn: ["hr"], integratesWith: [] });
    expect([manifest.events?.emits, Object.keys(manifest.events?.payloads ?? {})]).toEqual([Object.values(EVENTS), Object.values(EVENTS)]);
    const registry = workflowRegistry([manifest]);
    expect([[...registry.workflows.keys()], [...registry.schedules.values()].map((s) => [s.name, s.cron])]).toEqual([["keyflow.sync"], [["keyflow.sync", "*/15 * * * *"]]]);
    expect(manifest.routes.map((r) => [r.path, r.mount ?? "keyflow"])).toEqual([["", "keyflow"], ["p/:employeeNo/performance", "hr"]]);
  });
});

describe.skipIf(!hasDb)("with only hr installed, as a 029 job (Postgres)", () => {
  let db: Awaited<ReturnType<typeof keyflowDb>> | undefined;
  afterAll(() => { setTestTransport(null); return db?.t.drop(); });

  it("AC2 AC3 the keyflow.sync workflow runs on the Postgres engine with no other module installed", async () => {
    db = await keyflowDb(others(["hr", "keyflow"]));
    expect(db.modules.map((m) => m.id)).toEqual(["hr", "keyflow"]);
    setTestTransport(fakeKeyflow().transport);
    const registry = workflowRegistry([manifest]);
    const engine = createPostgresEngine({ db: db.app, registry });
    const runId = await engine.start(T, "keyflow.sync", null, { startedBy: "test" });
    await engine.tick();
    const run = await getRun(db.app, registry, T, runId, () => true);
    expect(run).toMatchObject({ status: "completed", output: { ok: true, summary: "Sent 2 people and 0 teams; got 0 goals, 0 review scores and 0 recognitions" } });
    expect((await db.q(sql`select count(*)::int as n from keyflow.sync_run`))[0].n).toBe(4);
  }, 240_000);
});
