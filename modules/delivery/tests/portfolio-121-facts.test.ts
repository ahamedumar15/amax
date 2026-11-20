import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { getProject } from "../server/queries";
import { proposalDb, T } from "./proposal-db";

type Db = Awaited<ReturnType<typeof proposalDb>>;
const row = async (maya: Viewer) => (await getProject(maya, "AFX"))!.project;

describe.skipIf(!hasDb)("121 review round 1: what the agent-first row reads", () => {
  let db: Db;
  let maya: Viewer;
  const release = (v: string, age: number) => db.t.owner`insert into delivery.release (tenant_id, project_id, version, created_at)
    select ${T}, id, ${v}, now() - make_interval(secs => ${age}) from delivery.project where key = 'AFX'`;
  const deploy = (v: string, env: string, status: string, released = false) => db.t.owner`insert into delivery.deployment (tenant_id, release_id, environment_id, status, released, recorded_by)
    select ${T}, r.id, e.id, ${status}, ${released}, 'test' from delivery.release r join delivery.environment e on e.project_id = r.project_id and e.name = ${env}
    where r.version = ${v} and r.project_id = (select id from delivery.project where key = 'AFX')`;
  const proposal = (key: string, phase: string, created: string) => db.t.owner`insert into delivery.proposal (tenant_id, project_id, key, title, phase, source, source_ref, created_at, updated_at)
    select ${T}, id, ${key}, ${key}, ${phase}, 'specclaw', ${key}, ${created}::timestamptz, now() from delivery.project where key = 'AFX'`;

  beforeAll(async () => {
    db = await proposalDb();
    maya = await db.as("maya");
    await db.t.owner`insert into delivery.project (tenant_id, key, name, client, billing, repo_url) values (${T}, 'AFX', 'Agent fixture', 'Internal', 'internal', 'github.com/example/afx')`;
    await db.t.owner`insert into delivery.environment (tenant_id, project_id, name, position, is_prod)
      select ${T}, id, e.name, e.position, e.name = 'Prod' from delivery.project, (values ('QA', 1), ('UAT', 2), ('Prod', 3)) e(name, position) where key = 'AFX'`;
    await proposal("AFX-001", "verified", "2026-10-01");
  }, 120_000);
  afterAll(() => db?.t.drop());

  it.each([
    ["a release older than the one in Prod is never next", async () => { await release("v1.0.0", 30); await release("v1.0.5", 20); await deploy("v1.0.5", "Prod", "deployed", true); },
      { nextRelease: "1 verified", nextReleaseNote: "not released" }],
    ["a rolled-back deployment is not where the release is now", async () => { await release("v1.1.0", 10); await deploy("v1.1.0", "QA", "deployed"); await deploy("v1.1.0", "UAT", "rolled-back"); },
      { nextRelease: "v1.1.0", nextReleaseNote: "in QA" }],
    ["a release whose only deployment was rolled back is not deployed", async () => { await release("v1.2.0", 5); await deploy("v1.2.0", "UAT", "rolled-back"); },
      { nextRelease: "v1.2.0", nextReleaseNote: "not deployed" }],
  ])("AC-4 %s", async (_, seed, want) => {
    await seed();
    expect(await row(maya)).toMatchObject(want);
  });

  it.each([
    ["a build with no progress for 14 days is at risk", async () => { await proposal("AFX-002", "building", "2000-01-01"); }, "at-risk"],
    ["a re-sync that only touches updated_at keeps it at risk", async () => { await db.t.owner`update delivery.proposal set updated_at = now() where key = 'AFX-002'`; }, "at-risk"],
    ["a task closed recently puts it back on track", async () => { await db.t.owner`insert into delivery.task (tenant_id, proposal_id, ref, title, done, done_at)
      select ${T}, id, 'T1', 'Done', true, now() from delivery.proposal where key = 'AFX-002'`; }, "on-track"],
  ])("AC-3 %s", async (_, seed, health) => {
    await seed();
    expect((await row(maya)).health).toBe(health);
  });
});
