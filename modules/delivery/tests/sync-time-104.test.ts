import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { installAuthorizer, loadViewer, setGrants, setViewerScopeResolvers, signInDemo, type Viewer } from "@amax/auth";
import { linkGitIdentity } from "@amax/auth/git-identity";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";
import { ctxFor } from "../server/context";
import { linkProjectRepo } from "../server/repo-sync";
import { pushSpecclaw } from "../server/push";
import { readSpecclaw } from "../sync/specclaw";

const T = lumen.tenant.id;
const REPO = "https://github.com/example/fleet-tracker.git";
const sha = (n: number) => `c0ffee${String(n).padStart(34, "0")}`;
const at = (h: string, day = "2026-11-12") => `${day}T${h}:00Z`;
const commit = (n: number, email: string, when: string) => ({ id: sha(n), email, at: when });

function fakeRepo(commits: { id: string; email: string; at: string }[]) {
  const root = mkdtempSync(join(tmpdir(), "amax-104-"));
  mkdirSync(join(root, ".specclaw/changes/101-export"), { recursive: true });
  writeFileSync(join(root, ".specclaw/changes/101-export/change.md"), "# 101-export title\n\n**Change:** 101-export\n\n\n");
  writeFileSync(join(root, ".specclaw/changes/101-export/status.md"), "| Proposal | ✅ Approved | |\n");
  return readSpecclaw(root).map((r) => ({ ...r, commits }));
}

// 104 AC-5 to AC-8: the push drafts hours from the change's commits for their authors, under consent, once per day,
// and never logs time itself.
describe.skipIf(!hasDb)("104 sync_specclaw drafts hours from commits", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let nimal: Viewer;
  let n = 0;
  const push = (commits: { id: string; email: string; at: string }[]) =>
    pushSpecclaw(nimal, { projectKey: "FLT", repoUrl: REPO, ref: "main", sha: `a1b2c${String(++n).padStart(2, "0")}`, committedAt: `2026-11-12T${String(9 + n).padStart(2, "0")}:00:00Z`, records: fakeRepo(commits), dryRun: false });
  const drafts = () => withTenant(app, T, (tx) => tx.execute(sql`select payload from core.event where name = 'delivery.commit.time' order by created_at, id`));
  const today = new Date().toISOString().slice(0, 10);

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
    await linkProjectRepo(ctxFor(nimal), { projectKey: "FLT", repoUrl: REPO, defaultBranch: "main" });
    await withTenant(app, T, (tx) => linkGitIdentity(tx, T, { provider: "github", login: "nimal-gh", email: "nimal@lumenlabs.test", userId: nimal.userId }));
  });
  afterAll(() => t?.drop());

  it("AC-6 with commit time off for the author's entity the push drafts nothing and reads as today", async () => {
    const r = await push([commit(1, "nimal@lumenlabs.test", at("09:00"))]);
    expect(r).toMatchObject({ outcome: "applied", created: 1, drafted: 0, unlinked: 0 });
    expect(await drafts()).toEqual([]);
  });

  it("AC-5, AC-7 hours go to the commit's author by verified git identity, once per day, for ended days after consent; unlinked and webhook-drafted commits are left out", async () => {
    await t.owner`insert into delivery.commit_time (tenant_id, legal_entity_id, enabled, notified_at, set_by)
      select ${T}, legal_entity_id, true, '2026-11-10T00:00:00Z', 'test' from auth.user where email = 'nimal@lumenlabs.test'`;
    await t.owner`insert into delivery.commit_draft (tenant_id, user_id, commit_id) values (${T}, ${nimal.userId}, ${sha(9)})`;
    const commits = [
      commit(1, "nimal@lumenlabs.test", at("09:00")), commit(2, "nimal@lumenlabs.test", at("09:40")), commit(3, "nimal@lumenlabs.test", at("10:15")),
      commit(4, "nimal@lumenlabs.test", at("10:00", "2026-11-09")),
      commit(5, "stranger@example.test", at("11:00")),
      commit(6, "nimal@lumenlabs.test", `${today}T03:00:00Z`),
      commit(9, "nimal@lumenlabs.test", at("15:00")),
    ];
    const r = await push(commits);
    expect(r).toMatchObject({ drafted: 1, unlinked: 1 });
    expect((await drafts()).map((e) => e.payload)).toEqual([
      { userId: nimal.userId, projectId: expect.any(String), projectKey: "FLT", proposalKey: "FLT-101", day: "2026-11-12", hours: 1.75, commit: "FLT-101/2026-11-12", commits: 3 },
    ]);
    expect(await push(commits)).toMatchObject({ outcome: "unchanged", drafted: 0 });
    expect(await drafts()).toHaveLength(1);
  });

  it("AC-8 the sync's own writes are the draft and its audit line; no time entry, week or approval", async () => {
    const actions = (await withTenant(app, T, (tx) => tx.execute(sql`select distinct action from core.audit_event where action like 'delivery.%' order by action`))).map((a) => a.action);
    expect(actions).toEqual(["delivery.commit_time.draft", "delivery.project.repo", "delivery.proposal.sync", "delivery.sync.push"]);
    expect(await withTenant(app, T, (tx) => tx.execute(sql`select after from core.audit_event where action = 'delivery.commit_time.draft'`))).toEqual([
      { after: { proposalId: expect.any(String), userId: nimal.userId, day: "2026-11-12", hours: 1.75, commits: 3 } }]);
    expect(await withTenant(app, T, (tx) => tx.execute(sql`select 1 from time.entry`))).toEqual([]);
  });
});
