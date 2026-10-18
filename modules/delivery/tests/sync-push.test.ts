import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { installAuthorizer, loadViewer, setGrants, setViewerScopeResolvers, signInDemo, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";
import { ctxFor } from "../server/context";
import { syncProposal } from "../server/services";
import { getRepoSync, linkProjectRepo, normaliseRepo } from "../server/repo-sync";
import { pushSpecclaw } from "../server/push";
import { readSpecclaw } from "../sync/specclaw";

const T = lumen.tenant.id;
const REPO = "https://github.com/example/fleet-tracker.git";

function fakeRepo(changes: Record<string, { tasks?: string; archived?: boolean }>) {
  const root = mkdtempSync(join(tmpdir(), "amax-push-"));
  for (const [dir, c] of Object.entries(changes)) {
    const base = join(root, ".specclaw/changes", c.archived ? "archive" : "", dir);
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, "change.md"), `# ${dir} title\n\n**Change:** ${dir}\n**Lane:** Delivery · **Module:** \`x\`\n\n## Tasks\n${c.tasks ?? ""}\n`);
    writeFileSync(join(base, "status.md"), "| Proposal | ✅ Approved | |\n");
  }
  return root;
}

// 062 AC-11: every refusal, the dry run, the idempotent re-push, the cap.
describe.skipIf(!hasDb)("062 sync_specclaw guard rails", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let nimal: Viewer;
  const count = async (q: ReturnType<typeof sql>) => Number((await withTenant(app, T, (tx) => tx.execute(q)))[0].n);
  const audits = () => count(sql`select count(*)::int as n from core.audit_event`);
  const records = readSpecclaw(fakeRepo({ "101-export": { tasks: "- [x] `T1` — one\n- [ ] `T2` — two" }, "102-import": {}, "103-old": { archived: true } }));
  const push = (o: Partial<Parameters<typeof pushSpecclaw>[1]> = {}) =>
    pushSpecclaw(nimal, { projectKey: "FLT", repoUrl: REPO, ref: "main", sha: "a1b2c3d", committedAt: "2026-10-08T09:00:00Z", records, ...o });

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([delivery]);
    setViewerScopeResolvers([delivery.viewerScopes!]);
    installAuthorizer();
    await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
    await withTenant(app, T, (tx) => tx.execute(sql`insert into auth.role_assignment (tenant_id, user_id, role, source)
      select ${T}, id, 'PM', 'manual' from auth.user where email = 'nimal@lumenlabs.test'`));
    nimal = (await loadViewer(app, T, (await signInDemo(app, T, "nimal@lumenlabs.test")).sessionId))!;
  });
  afterAll(() => t?.drop());

  it("AC-4 a PM links only a project they manage; a push from any other repo is refused and recorded", async () => {
    expect(normaliseRepo("git@GitHub.com:example/fleet-tracker.git")).toBe("github.com/example/fleet-tracker");
    expect(await push({ dryRun: false })).toMatchObject({ outcome: "refused", reason: expect.stringMatching(/no linked repo/) });
    await expect(linkProjectRepo(ctxFor(nimal), { projectKey: "CON", repoUrl: REPO })).rejects.toThrow(/data scope/);
    await linkProjectRepo(ctxFor(nimal), { projectKey: "FLT", repoUrl: "git@github.com:example/fleet-tracker" });
    expect(await push({ repoUrl: "https://github.com/example/other", dryRun: false })).toMatchObject({ outcome: "refused", reason: expect.stringMatching(/repo not linked to FLT/) });
    expect((await getRepoSync(nimal, { projectKey: "FLT" }))!.recent.map((p) => p.outcome)).toEqual(["refused", "refused"]);
  });

  it("AC-3/AC-5 refuses an unknown project and a project the person isn't on; the push grant doesn't open sync_proposal", async () => {
    await expect(push({ projectKey: "NOPE" })).rejects.toThrow(/no project NOPE/);
    await expect(push({ projectKey: "CON" })).rejects.toThrow(/forbidden/);
    // sync_proposal has none of the push's guards, so a PM's push grant must not reach it (review round 1).
    await expect(syncProposal(ctxFor(nimal), { projectKey: "FLT", project: { name: "x", client: "x" }, key: "FLT-901", title: "x", phase: "released", tasksDone: 0, tasksTotal: 0,
      source: "specclaw", sourceRef: "901-x", releasedAt: null, meta: {} })).rejects.toThrow(/forbidden/);
  });

  it("AC-2/AC-6/AC-7 a dry run writes nothing; an apply never releases; re-pushing the same state writes and audits nothing", async () => {
    const before = await audits();
    const preview = await push();
    expect(preview).toMatchObject({ outcome: "preview", created: 2, updated: 0, skipped: ["FLT-103: released comes from Prod deployments"] });
    expect(await audits()).toBe(before);
    expect(await push({ dryRun: false })).toMatchObject({ outcome: "applied", created: 2, skipped: preview.skipped });
    expect(await count(sql`select count(*)::int as n from delivery.proposal where key = 'FLT-103'`)).toBe(0);
    expect((await getRepoSync(nimal, { projectKey: "FLT" }))!.lastApplied).toMatchObject({ by: "Nimal Silva", created: 2 });
    const settled = await audits(), rows = await count(sql`select count(*)::int as n from delivery.sync_push`);
    // The archived change is skipped every time; that alone isn't a write (review round 1).
    expect(await push({ sha: "b2c3d4e", committedAt: "2026-10-08T10:00:00Z", dryRun: false })).toMatchObject({ outcome: "applied", created: 0, updated: 0, unchanged: 2, skipped: preview.skipped });
    expect([await audits(), await count(sql`select count(*)::int as n from delivery.sync_push`)]).toEqual([settled, rows]);
    await expect(push({ records: Array(201).fill(records[0]) })).rejects.toThrow(/200/);
  });

  it.each([
    ["an older commit, from any branch", { ref: "specclaw/101-export", sha: "01dc0de", committedAt: "2026-10-07T09:00:00Z", repo: { "101-export": { tasks: "- [x] `T1` — one\n- [x] `T2` — two" } } }, /^FLT-101: stale: last synced from a newer commit/],
    ["a lagging branch's earlier phase", { ref: "specclaw/x", sha: "c0ffee1", committedAt: "2026-10-08T11:00:00Z", repo: { "101-export": {} } }, /^FLT-101: would move back from building to planned$/],
    ["an archived change on a branch", { ref: "specclaw/y", sha: "c0ffee2", committedAt: "2026-10-08T11:00:00Z", repo: { "102-import": { archived: true } } }, /^FLT-102: released comes from Prod deployments$/],
  ])("AC-6/AC-8 a push skips %s and writes nothing for it", async (_name, o, why) => {
    const { repo, ...rest } = o;
    const r = await push({ ...rest, records: readSpecclaw(fakeRepo(repo)), dryRun: false });
    expect(r).toMatchObject({ created: 0, updated: 0 });
    expect(r.skipped).toEqual([expect.stringMatching(why)]);
  });

  it("AC-8 refuses a commit time in the future, and two concurrent pushes keep the newer one", async () => {
    await expect(push({ committedAt: new Date(Date.now() + 3_600_000).toISOString() })).rejects.toThrow(/future/);
    const at = (h: number, done: boolean) => ({ sha: `abc${h}def`, committedAt: `2026-10-08T${h}:00:00Z`, dryRun: false,
      records: readSpecclaw(fakeRepo({ "101-export": { tasks: "- [x] `T1` — one\n- [x] `T2` — two" }, "102-import": { tasks: `- [${done ? "x" : " "}] \`T1\` — one` } })) });
    await Promise.all([push(at(13, false)), push(at(14, true))]);
    const [row] = await withTenant(app, T, (tx) => tx.execute(sql`select meta->>'committedAt' as at, tasks_done from delivery.proposal where key = 'FLT-102'`));
    expect(row).toEqual({ at: "2026-10-08T14:00:00Z", tasks_done: 1 });
  });

  it("AC-11 erasure can anonymise who pushed (the app role may update sync_push)", async () => {
    await withTenant(app, T, (tx) => tx.execute(sql`update delivery.sync_push set for_user_id = null where false`));
    const [g] = await withTenant(app, T, (tx) => tx.execute(sql`select has_table_privilege('delivery.sync_push', 'update') as ok`));
    expect(g.ok).toBe(true);
  });
});
