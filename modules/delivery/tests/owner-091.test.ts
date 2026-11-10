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
import { updateProposal } from "../server/lifecycle";
import { linkProjectRepo } from "../server/repo-sync";
import { pushSpecclaw } from "../server/push";
import { readSpecclaw } from "../sync/specclaw";

const T = lumen.tenant.id;
const REPO = "https://github.com/example/fleet-tracker.git";

function fakeRepo(dir: string, ownerLine?: string) {
  const root = mkdtempSync(join(tmpdir(), "amax-own-"));
  mkdirSync(join(root, ".specclaw/changes", dir), { recursive: true });
  writeFileSync(join(root, ".specclaw/changes", dir, "change.md"), `# ${dir} title\n\n**Change:** ${dir}${ownerLine ? `\n${ownerLine}` : ""}\n\n## Problem\n\n**Owner:** not-header@example.test\n`);
  return root;
}

// 091 AC-7: the owner comes from the repo, never from who pushed (here Nimal, the PM, pushes everything).
describe.skipIf(!hasDb)("091 a spec proposal's owner comes from its repo", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let nimal: Viewer;
  let at = 0;
  const push = (dir: string, o: { ownerLine?: string; author?: string | null } = {}) =>
    pushSpecclaw(nimal, { projectKey: "FLT", repoUrl: REPO, ref: "main", sha: `0a0b0c${String(++at).padStart(2, "0")}`, committedAt: `2026-10-08T${String(9 + at).padStart(2, "0")}:00:00Z`,
      records: readSpecclaw(fakeRepo(dir, o.ownerLine)).map((r) => ({ ...r, author: o.author ?? null })), dryRun: false });
  const ownerOf = async (key: string) => (await withTenant(app, T, (tx) => tx.execute(sql`select owner_name from delivery.proposal where key = ${key}`)))[0]?.owner_name ?? null;

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
    await withTenant(app, T, (tx) => tx.execute(sql`insert into auth.git_identity (tenant_id, user_id, provider, login, email, email_verified)
      select ${T}, id, 'github', 'nimal-dev', 'nimal.commits@example.test', true from auth.user where email = 'nimal@lumenlabs.test'`));
  });
  afterAll(() => t?.drop());

  it("AC-7 the reader takes the Owner line from the header only", () => {
    expect(readSpecclaw(fakeRepo("501-a", "**Owner:** `kasun@lumenlabs.test`"))[0].owner).toBe("kasun@lumenlabs.test");
    expect(readSpecclaw(fakeRepo("502-b"))[0].owner).toBeNull();
  });

  it.each([
    ["the Owner line names a person on the project", "511-owner-line", { ownerLine: "**Owner:** nimal@lumenlabs.test", author: "someone@example.test" }, "Nimal Silva"],
    ["no Owner line: the change's author, by work email", "512-author", { author: "NIMAL@lumenlabs.test" }, "Nimal Silva"],
    ["the author, by a verified git identity", "513-identity", { author: "nimal.commits@example.test" }, "Nimal Silva"],
    ["a person who isn't on the project", "514-off-project", { ownerLine: "**Owner:** liam@lumenlabs.test" }, null],
    ["an email nobody in amax has", "515-unknown", { author: "stranger@example.test" }, null],
    ["the repo names nobody: never the person who pushed", "516-nobody", {}, null],
  ])("AC-7 %s", async (_, dir, o, owner) => {
    await push(dir, o);
    expect(await ownerOf(`FLT-${dir.slice(0, 3)}`)).toBe(owner);
  });

  it("AC-7 a sync follows the repo until a person sets the owner in amax; then it stands", async () => {
    await push("521-follow", { author: "nimal@lumenlabs.test" });
    expect(await ownerOf("FLT-521")).toBe("Nimal Silva");
    await push("521-follow", { author: "stranger@example.test" });
    expect(await ownerOf("FLT-521")).toBeNull();
    await updateProposal(ctxFor(nimal), { key: "FLT-521", ownerUserId: nimal.userId });
    expect(await ownerOf("FLT-521")).toBe("Nimal Silva");
    await push("521-follow", { author: "stranger@example.test" });
    expect(await ownerOf("FLT-521")).toBe("Nimal Silva");
  });
});
