import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { can, type Viewer } from "@amax/auth";
import { authorsOf } from "../sync/authors";
import { readSpecclaw, type SpecRecord } from "../sync/specclaw";
import { ctxFor } from "../server/context";
import { ownerFrozen } from "../server/owner";
import { proposeCreate } from "../server/proposal-card";
import { proposalDetail, proposalEvent } from "../server/proposal-detail";
import { pushSpecclaw } from "../server/push";
import { shippedPerWeek, phaseCounts } from "../server/queries";
import { linkProjectRepo } from "../server/repo-sync";
import { markTaskDone } from "../server/tasks";
import { proposalDb } from "./proposal-db";

const DAY = "2026-10-01";
const header = (dir: string, created?: string) => `# ${dir}\n\n**Change:** ${dir}${created ? ` · **Created:** ${created}` : ""}\n\n## Tasks\n\n`;
const tasks = (t1: boolean, t2: boolean) => `- [${t1 ? "x" : " "}] \`T1\` — first\n- [${t2 ? "x" : " "}] \`T2\` — second\n`;

/** A repo whose commits carry fixed dates: written on Oct 1, T1 ticked Oct 3, T2 ticked Oct 5, unticked Oct 6, ticked again Oct 7. */
function datedRepo() {
  const root = mkdtempSync(join(tmpdir(), "amax-094-"));
  const git = (env: Record<string, string>, ...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8", env: { ...process.env, ...env } }).trim();
  git({}, "init", "-q", "-b", "main");
  const at = (when: string, msg: string) => {
    git({}, "add", "-A");
    git({ GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when }, "-c", "user.email=writer@example.test", "-c", "user.name=Fixture", "commit", "-qm", msg);
  };
  const write = (dir: string, body: string) => { mkdirSync(join(root, ".specclaw/changes", dir), { recursive: true }); writeFileSync(join(root, ".specclaw/changes", dir, "change.md"), body); };
  write("301-dated", header("301-dated", DAY) + tasks(false, false));
  write("302-undated", header("302-undated") + tasks(false, false));
  at("2026-10-01T10:00:00Z", "write 301 and 302");
  write("301-dated", header("301-dated", DAY) + tasks(true, false)); at("2026-10-03T09:00:00Z", "tick T1");
  write("301-dated", header("301-dated", DAY) + tasks(true, true)); at("2026-10-05T09:00:00Z", "tick T2");
  write("301-dated", header("301-dated", DAY) + tasks(true, false)); at("2026-10-06T09:00:00Z", "untick T2");
  write("301-dated", header("301-dated", DAY) + tasks(true, true)); at("2026-10-07T09:00:00Z", "tick T2 again");
  const sha = git({}, "rev-parse", "HEAD");
  return { root, sha, records: authorsOf(root, sha, readSpecclaw({ dir: root, ref: `main@${sha}` })) };
}

// 094 AC-1, AC-2: the repo's own dates, read once from its files and git.
describe("094 the repo's dates", () => {
  const repo = datedRepo();
  const rec = (dir: string) => repo.records.find((r) => r.dir === dir)!;

  it.each([
    ["the Created header", "301-dated", "2026-10-01T00:00:00.000Z"],
    ["no header and no state.json: the commit that added change.md", "302-undated", "2026-10-01T10:00:00.000Z"],
  ])("AC-1 created from %s", (_, dir, at) => {
    expect(rec(dir).createdAt).toBe(at);
  });

  it.each([
    ["ticked once", "T1", "2026-10-03T09:00:00.000Z"],
    ["unticked and ticked again: its last tick", "T2", "2026-10-07T09:00:00.000Z"],
  ])("AC-2 a task %s is dated by the commit that ticked it", (_, ref, at) => {
    expect(rec("301-dated").tasks.find((t) => t.ref === ref)!.doneAt).toBe(at);
  });

  it("AC-2 an open task has no date", () => {
    expect(rec("302-undated").tasks.every((t) => !t.doneAt)).toBe(true);
  });

  const state = (phases: Record<string, unknown>, created?: string) => {
    const root = mkdtempSync(join(tmpdir(), "amax-094s-"));
    mkdirSync(join(root, ".specclaw/changes/303-state"), { recursive: true });
    writeFileSync(join(root, ".specclaw/changes/303-state/change.md"), header("303-state", created));
    writeFileSync(join(root, ".specclaw/changes/303-state/state.json"), JSON.stringify({ phases }));
    return readSpecclaw(root)[0];
  };
  it.each([
    ["the header's day, timed by state.json when it's the same day", { proposal: { status: "approved", at: "2026-10-01T05:46:46Z" } }, DAY, "2026-10-01T05:46:46.000Z"],
    ["the header's day at midnight when state.json says another day", { proposal: { status: "approved", at: "2026-10-04T05:00:00Z" } }, DAY, "2026-10-01T00:00:00.000Z"],
    ["state.json's proposal time without a header", { proposal: { status: "approved", at: "2026-10-04T05:00:00Z" } }, undefined, "2026-10-04T05:00:00.000Z"],
    ["neither: unknown here (git fills it)", {}, undefined, null],
  ])("AC-1 created from %s", (_, phases, created, at) => {
    expect(state(phases, created).createdAt).toBe(at);
  });

  it("AC-3 the phases reached in the repo, not failed or pending ones", () => {
    expect(state({ proposal: { status: "approved", at: "2026-10-01T05:00:00Z" }, tasks: { status: "done", at: "2026-10-01T06:00:00Z" },
      verify: { status: "failed", at: "2026-10-02T06:00:00Z" }, pr: { status: "raised", at: "not a time" } }).phaseTimes)
      .toEqual({ proposal: "2026-10-01T05:00:00.000Z", tasks: "2026-10-01T06:00:00.000Z" });
  });
});

// 094 AC-6: one owner-freeze rule, checked as a table.
describe("094 AC-6 ownerFrozen", () => {
  it.each([
    ["a person set it", { owner_set_by_person: true }, "a@b.test", true],
    ["the repo's answer is unknown", { owner_set_by_person: false }, undefined, true],
    ["the repo names someone", { owner_set_by_person: false }, "a@b.test", false],
    ["the repo names nobody", { owner_set_by_person: false }, null, false],
    ["a new proposal", undefined, "a@b.test", false],
  ])("%s", (_, cur, email, frozen) => {
    expect(ownerFrozen(cur, email)).toBe(frozen);
  });
});

describe.skipIf(!hasDb)("094 the repo's dates in amax", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  const REPO = "github.com/example/fleet-tracker";
  let at = 0;
  const push = (records: SpecRecord[], ref = "main") =>
    pushSpecclaw(maya, { projectKey: "FLT", repoUrl: REPO, ref, sha: `0d0e0f${String(++at).padStart(2, "0")}`,
      committedAt: new Date(Date.parse("2026-10-08T09:00:00Z") + at * 60_000).toISOString(), records: records as never, dryRun: false });
  const rows = (key: string) => db.q(sql`select t.ref, t.done_at, t.done_by, p.created_at from delivery.task t join delivery.proposal p on p.id = t.proposal_id where p.key = ${key} order by t.ref`);
  const iso = (v: unknown) => new Date(v as string).toISOString();
  const { records } = datedRepo();
  const dated = records.find((r) => r.dir === "301-dated")!;
  // What an older plugin sends: no created date, no task dates, no phase times.
  const undated = (r: SpecRecord): SpecRecord => ({ ...r, createdAt: null, phaseTimes: {}, tasks: r.tasks.map(({ doneAt: _, ...t }) => t) });

  beforeAll(async () => {
    db = await proposalDb();
    maya = await db.as("maya");
    await linkProjectRepo(ctxFor(maya), { projectKey: "FLT", repoUrl: REPO, defaultBranch: "main" });
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-1, AC-2 a proposal and tasks first synced without dates take the repo's on the next sync", async () => {
    await push([undated(dated)]);
    const before = await rows("FLT-301");
    expect(iso(before[0].created_at)).not.toBe(dated.createdAt);
    const second = await push([{ ...dated, phaseTimes: { proposal: "2026-10-01T05:00:00.000Z", verify: "2026-10-07T10:00:00.000Z" } }]);
    expect(second.updated).toBe(1);
    const after = await rows("FLT-301");
    expect(iso(after[0].created_at)).toBe("2026-10-01T00:00:00.000Z");
    expect(after.map((t) => iso(t.done_at))).toEqual(["2026-10-03T09:00:00.000Z", "2026-10-07T09:00:00.000Z"]);
    // Nothing differs now, so the next sync writes nothing.
    expect((await push([{ ...dated, phaseTimes: { proposal: "2026-10-01T05:00:00.000Z", verify: "2026-10-07T10:00:00.000Z" } }])).unchanged).toBe(1);
  });

  it("AC-2 a task a commit message closed keeps its own date and who closed it", async () => {
    const open = { ...dated, number: "304", dir: "304-closed-by-commit", tasks: dated.tasks.map((t) => ({ ...t, done: false, doneAt: null })) };
    await push([open]);
    await markTaskDone(ctxFor(maya), { key: "FLT-304", task: "T1", commit: "abc1234" });
    const [closed] = await rows("FLT-304");
    await push([{ ...open, tasks: dated.tasks }]);
    const [t1] = await rows("FLT-304");
    expect({ at: iso(t1.done_at), by: t1.done_by }).toEqual({ at: iso(closed.done_at), by: closed.done_by });
    expect(t1.done_by).toBeTruthy();
  });

  it("AC-3 the proposal's history shows the repo's phase times, in time order, and each line pins", async () => {
    const detail = (await proposalDetail(maya, { key: "FLT-301" }))!;
    const repoLines = detail.history.filter((e) => e.id.startsWith("repo:"));
    expect(repoLines.map((e) => [e.text, e.at])).toEqual([["Verified in the repo", "2026-10-07T10:00:00.000Z"], ["Approved in the repo", "2026-10-01T05:00:00.000Z"]]);
    const all = detail.history.map((e) => e.at);
    expect(all).toEqual([...all].sort().reverse());
    expect(await proposalEvent(maya, { proposalId: detail.id, line: "repo:verify" })).toMatchObject({ text: "Verified in the repo" });
  });

  it("AC-4 Shipped to Prod counts only what a Prod deployment released, not the repo's archive", async () => {
    const [shipped, month] = [(await shippedPerWeek(maya)).values.reduce((a, b) => a + b, 0), (await phaseCounts(maya)).releasedThisMonth];
    await db.t.owner`insert into delivery.proposal (tenant_id, project_id, key, title, phase, source, source_ref, released_at, meta)
      select tenant_id, id, 'FLT-801', 'From the archive', 'released', 'specclaw', '801-archived', now(), '{}'::jsonb from delivery.project where key = 'FLT'`;
    expect((await shippedPerWeek(maya)).values.reduce((a, b) => a + b, 0)).toBe(shipped);
    expect((await phaseCounts(maya)).releasedThisMonth).toBe(month);
  });

  it("AC-6 a branch's key conflict is reported before its unreadable state.json", async () => {
    const other = { ...dated, dir: "301-other-name", unreadable: true };
    const out = await push([other], "specclaw/301-other-name");
    expect(out.skipped).toEqual(["FLT-301: two changes numbered 301: 301-dated, 301-other-name"]);
  });

  it("AC-6 a viewer who can't add proposals to a project isn't told where its repo is", async () => {
    await db.t.owner`update delivery.project set repo_url = 'github.com/example/hr-intranet', repo_default_ref = 'main' where key = 'HRI'`;
    await db.t.owner`insert into delivery.proposal (tenant_id, project_id, key, title, phase, source, source_ref, meta)
      select tenant_id, id, 'HRI-701', 'Synced', 'proposed', 'specclaw', '701-synced', '{}'::jsonb from delivery.project where key = 'HRI'`;
    const [hri] = await db.q(sql`select id from delivery.project where key = 'HRI'`);
    let outsider: Viewer | undefined;
    for (const key of ["kasun", "sahan", "liam", "sarah", "nimal"]) {
      const v = await db.as(key);
      if (can(v, "delivery:read") && !can(v, "delivery:proposal:create", { projectId: hri.id as string })) { outsider = v; break; }
    }
    expect(outsider).toBeDefined();
    const refused = proposeCreate(outsider!, { projectKey: "HRI", title: "By hand" });
    await expect(refused).rejects.toThrow(/you can't add proposals to/);
    await expect(refused).rejects.not.toThrow(/hr-intranet/);
  });
});
