import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createProject, createRelease, recordDeployment, removeEnvironment, updateRelease, upsertEnvironment } from "../server/services";
import { releaseOffers } from "../server/pin-offers";
import { getRelease } from "../server/queries";
import { OPEN, releaseDb, T } from "./release-db";

// 123's review (round 1, over the release stack): a completed release is offered no write it would refuse; an environment
// open releases complete on can't be renamed away, unmarked or removed; tracking a release that already reached its
// category's environment completes it.
describe.skipIf(!hasDb)("123 review: completed offers, stranded categories, completion from history (Postgres)", () => {
  let db: Awaited<ReturnType<typeof releaseDb>>;
  let key = 0;
  const project = async () => {
    const k = `RV${++key}`;
    await createProject(db.admin(), { key: k, name: `Review ${k}`, client: "x", billing: "internal" });
    return k;
  };
  const untracked = (k: string, version: string) =>
    db.t.owner`insert into delivery.release (tenant_id, project_id, version) select ${T}, id, ${version} from delivery.project where key = ${k}`;
  beforeAll(async () => {
    db = await releaseDb();
  }, 120_000);
  afterAll(() => db?.t.drop());

  it.each([
    { category: "dev", deployTo: "Dev", completed: true },
    { category: "uat", deployTo: "UAT", completed: true },
    { category: "uat", deployTo: "Dev", completed: false },
  ])("a $category release deployed to $deployTo offers re-tag and change proposals only while open", async ({ category, deployTo, completed }) => {
    const k = await project();
    await createRelease(db.admin(), { ...OPEN, projectKey: k, version: "o1", category });
    await recordDeployment(db.admin(), { projectKey: k, version: "o1", environment: deployTo });
    const release = (await getRelease(db.sahan, k, "o1"))!;
    expect(release.status === "completed").toBe(completed);
    const labels = (await releaseOffers(db.sahan, { releaseId: release.id })).map((o) => o.label);
    for (const write of [`Re-tag ${k} o1`, `Change the proposals in ${k} o1`]) expect(labels.includes(write)).toBe(!completed);
  });

  it.each([
    { change: "rename UAT", category: "uat", run: (k: string) => upsertEnvironment(db.admin(), { projectKey: k, name: "UAT", rename: "Staging" }), refused: true },
    { change: "unmark Prod", category: "prod", run: (k: string) => upsertEnvironment(db.admin(), { projectKey: k, name: "Prod", isProd: false }), refused: true },
    { change: "remove Dev", category: "dev", run: (k: string) => removeEnvironment(db.admin(), { projectKey: k, name: "Dev" }), refused: true },
    { change: "rename UAT's case", category: "uat", run: (k: string) => upsertEnvironment(db.admin(), { projectKey: k, name: "UAT", rename: "uat" }), refused: false },
    { change: "rename QA", category: "uat", run: (k: string) => upsertEnvironment(db.admin(), { projectKey: k, name: "QA", rename: "Test" }), refused: false },
  ])("$change with an open $category release: refused $refused", async ({ category, run, refused }) => {
    const k = await project();
    await createRelease(db.admin(), { ...OPEN, projectKey: k, version: "s1", category });
    if (refused) await expect(run(k)).rejects.toThrow(new RegExp(`s1 is an open .* release that completes on`));
    else await expect(run(k)).resolves.toBeDefined();
  });

  it("a completed release doesn't hold its environment", async () => {
    const k = await project();
    await createRelease(db.admin(), { ...OPEN, projectKey: k, version: "d1" });
    await recordDeployment(db.admin(), { projectKey: k, version: "d1", environment: "UAT" });
    await expect(upsertEnvironment(db.admin(), { projectKey: k, name: "UAT", rename: "Staging" })).resolves.toBeDefined();
  });

  it.each([
    { case: "tracking an untracked live release", from: null, to: "uat", completes: true },
    { case: "moving a Dev release to UAT, already reached", from: "dev", to: "uat", completes: true },
    { case: "moving a Dev release to Prod, not reached", from: "dev", to: "prod", completes: false },
  ])("update_release: $case completes it: $completes, with no Off track on the way", async ({ from, to, completes }) => {
    const k = await project();
    if (from) await createRelease(db.admin(), { ...OPEN, projectKey: k, version: "h1", category: from });
    else await untracked(k, "h1");
    for (const environment of ["QA", "UAT"]) await recordDeployment(db.admin(), { projectKey: k, version: "h1", environment });
    const target = "2026-10-02";
    const out = await updateRelease(db.admin(), { projectKey: k, version: "h1", category: to, startDate: "2026-10-01", targetDate: target });
    const release = (await getRelease(db.sahan, k, "h1"))!;
    const uat = release.history.find((d) => d.environment === "UAT")!;
    expect([out.status, release.status]).toEqual(completes ? ["completed", "completed"] : ["overdue", "overdue"]);
    if (!completes) return;
    expect([release.completingDeploymentId, release.completedAt, release.completion]).toEqual([uat.id, uat.at, "late"]);
    expect(release.statusHistory.map((h) => `${h.to}:${h.source}`).at(-1)).toBe("completed:deployment");
    expect(release.statusHistory.some((h) => h.to === "overdue")).toBe(false);
  });
});
