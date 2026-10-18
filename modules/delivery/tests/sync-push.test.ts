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
import { getRepoSync, linkProjectRepo, normaliseRepo, pushSpecclaw } from "../server/repo-sync";
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
    pushSpecclaw(nimal, { projectKey: "FLT", repoUrl: REPO, ref: "main", sha: "a1b2c3d", committedAt: "2026-10-18T09:00:00Z", records, ...o });

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

  it("AC-3/AC-5 refuses an unknown project and a project the person isn't on", async () => {
    await expect(push({ projectKey: "NOPE" })).rejects.toThrow(/no project NOPE/);
    await expect(push({ projectKey: "CON" })).rejects.toThrow(/forbidden/);
  });

  it("AC-2/AC-6 a dry run writes nothing; applying never releases", async () => {
    const before = await audits();
    const preview = await push();
    expect(preview).toMatchObject({ outcome: "preview", created: 2, updated: 0, skipped: ["FLT-103: released comes from Prod deployments"] });
    expect(await audits()).toBe(before);
    expect(await push({ dryRun: false })).toMatchObject({ outcome: "applied", created: 2, skipped: preview.skipped });
    expect(await count(sql`select count(*)::int as n from delivery.proposal where key = 'FLT-103'`)).toBe(0);
    expect((await getRepoSync(nimal, { projectKey: "FLT" }))!.lastApplied).toMatchObject({ by: expect.stringMatching(/^Claude for Nimal/), created: 2 });
  });

  it("AC-7 re-pushing the same state writes and audits nothing; over 200 records is refused", async () => {
    const r = readSpecclaw(fakeRepo({ "101-export": { tasks: "- [x] `T1` — one\n- [ ] `T2` — two" }, "102-import": {} }));
    const before = await audits();
    expect(await push({ records: r, sha: "b2c3d4e", committedAt: "2026-10-18T10:00:00Z", dryRun: false })).toMatchObject({ outcome: "applied", created: 0, updated: 0, unchanged: 2 });
    expect(await audits()).toBe(before);
    await expect(push({ records: Array(201).fill(r[0]) })).rejects.toThrow(/200/);
  });

  it("AC-6 a push never moves a proposal back to an earlier phase", async () => {
    const behind = readSpecclaw(fakeRepo({ "101-export": {} }));
    expect(await push({ records: behind })).toMatchObject({ skipped: ["FLT-101: would move back from building to planned"] });
  });

  it("AC-8 a commit older than the last one applied from the same branch is stale", async () => {
    expect(await push({ sha: "01dc0de", committedAt: "2026-10-17T09:00:00Z", dryRun: false })).toMatchObject({ outcome: "refused", reason: expect.stringMatching(/^stale/) });
    expect(await push({ ref: "specclaw/101-export", sha: "01dc0de", committedAt: "2026-10-17T09:00:00Z" })).toMatchObject({ outcome: "preview" });
  });
});
