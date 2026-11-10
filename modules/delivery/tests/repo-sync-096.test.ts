import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { ctxFor } from "../server/context";
import { resolveRepoPhases } from "../server/repo-time";
import { markSynced, syncProposal } from "../server/services";
import { pushSpecclaw } from "../server/push";
import { linkProjectRepo } from "../server/repo-sync";
import { desired } from "../sync/import";
import { AT_SHA, isRead } from "../sync/sha";
import type { SpecRecord } from "../sync/specclaw";
import { refOf } from "../sync/withdraw";
import { proposalDb } from "./proposal-db";

const past = "2026-10-01T00:00:00.000Z";
const later = "2026-10-05T00:00:00.000Z";
const future = "2030-01-01T00:00:00.000Z";
const READ = "main@abc1234";
const old = { at: past, source: "main@0000000" };
const stored = { proposal: old, verify: old };

// 096 AC-1: a phase the repo reached stays recorded.
describe("096 AC-1 repo phases are kept once reached", () => {
  it.each([
    ["a read that leaves a phase out (its status moved on) keeps it", { proposal: past }, { proposal: old, verify: old }],
    ["a read with no phases (no state.json) keeps them all", {}, stored],
    ["a new time replaces the entry, with this read", { proposal: past, verify: later }, { proposal: old, verify: { at: later, source: READ } }],
    ["the same time keeps the read that first recorded it", { proposal: past, verify: past }, stored],
    ["a time in the future is unknown, so the stored entry stands", { verify: future }, stored],
    ["a new phase is added", { pr: later }, { ...stored, pr: { at: later, source: READ } }],
  ])("%s", (_, read, want) => {
    expect(resolveRepoPhases(read, READ, stored)).toEqual(want);
  });

  it("phase times not read at all keep the stored ones", () => {
    expect(resolveRepoPhases(undefined, READ, stored)).toEqual(stored);
  });
});

// 096 AC-2: stored entries are read one by one.
describe("096 AC-2 a malformed stored entry hides only itself", () => {
  it.each([
    ["a bad time", { proposal: old, verify: { at: "yesterday", source: READ } }],
    ["not an object or a time", { proposal: old, verify: 42 }],
    ["an unknown phase", { proposal: old, deploy: old }],
  ])("%s", (_, bad) => {
    expect(resolveRepoPhases(undefined, null, bad)).toEqual({ proposal: old });
  });
});

// 096 AC-3: a read is recorded only from "<ref>@<sha>" by the one commit-sha rule.
describe("096 AC-3 a phase's read", () => {
  it.each([
    ["a ref and a sha", "specclaw/096-x@abc1234def", "specclaw/096-x@abc1234def"],
    ["a ref that itself has an @ (git allows it)", "feat@v2@abc1234", "feat@v2@abc1234"],
    ["made-up text", "the repo", null],
    ["a ref with no sha", "main@", null],
    ["not hex", "main@zzzzzzz", null],
    ["absent", undefined, null],
  ])("%s", (_, source, want) => {
    expect(resolveRepoPhases({ pr: later }, source, null)?.pr?.source).toBe(want);
  });

  // Review round 1: a stored read is kept as stored; only a write's own read is checked.
  it("a stored read stays as stored through later writes", () => {
    const kept = { pr: { at: later, source: "recorded earlier" } };
    expect(resolveRepoPhases({ proposal: past }, READ, kept)).toEqual({ ...kept, proposal: { at: past, source: READ } });
  });

  it.each([
    ["main@4f2c9a1", true], ["feat@v2@4f2c9a1", true], ["@4f2c9a1", false], ["main@", false], ["main@zz", false], ["main", false],
  ])("isRead(%s) is %s, the rule refOf and the author walk use", (source, want) => {
    expect(isRead(source)).toBe(want);
    expect(refOf(source) !== source).toBe(AT_SHA.test(source));
  });
});

// Review round 1: releasedAt is normalised once where the write is built (desired(), the push and the self-sync), and
// the write bounds it; the schema is the same on every path, so no form of it stops a run.
const record = (releasedAt: string | null, n = "971") => ({ number: n, dir: `${n}-released`, title: "Released", lane: "", module: "", phase: "released", approved: true, claim: null,
  hard: [], optional: [], tasksDone: 0, tasksTotal: 0, tasks: [], acs: 0, pr: null, verdict: null, done: true, status: "done", waiting: [], updatedAt: null,
  releasedAt, source: "main@abc1234", unreadable: false, duplicate: false, owner: null }) as SpecRecord;
const RELEASED: [string, string | null, string | null][] = [
  ["a time with an offset", "2026-10-17T03:12:41Z", "2026-10-17T03:12:41.000Z"],
  ["a time with no offset", "2026-10-17T03:12:41", new Date("2026-10-17T03:12:41").toISOString()],
  ["a day only", "2026-10-17", "2026-10-17T00:00:00.000Z"],
  ["not a time", "soon", null],
];
describe("096 releasedAt normalised where the write is built", () => {
  it.each(RELEASED)("%s", (_, t, want) => {
    expect(desired("FLT", record(t), "abc1234").releasedAt).toBe(want);
  });
});

// 096 AC-4: every writer bounds the times it's given.
describe.skipIf(!hasDb)("096 AC-4 sync_proposal and mark_synced bound their times", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  const write = (key: string, over: { committedAt?: string; releasedAt?: string | null }) => syncProposal(ctxFor(maya), {
    projectKey: "FLT", project: { name: "Fleet", client: "C" }, key, title: key, phase: "verified", tasksDone: 0, tasksTotal: 0,
    source: "specclaw", sourceRef: `${key.slice(4)}-x`, releasedAt: null, meta: { source: READ }, committedAt: "2026-10-08T09:00:00.000Z", ...over,
  });

  beforeAll(async () => {
    db = await proposalDb();
    maya = await db.as("maya");
    await linkProjectRepo(ctxFor(maya), { projectKey: "FLT", repoUrl: "github.com/example/fleet-tracker", defaultBranch: "main" });
  }, 120_000);

  // Review round 1: the push (the main writer) stores the same thing: a default-branch push brings an archived change in
  // as Released history, with its archive date normalised, and a future one as unknown.
  let n = 980;
  it.each([...RELEASED, ["in the future", future, null] as [string, string, null]])("the push stores a releasedAt %s", async (_, t, want) => {
    const key = String(++n);
    const out = await pushSpecclaw(maya, { projectKey: "FLT", repoUrl: "github.com/example/fleet-tracker", ref: "main", sha: `0e0f${key}a`,
      committedAt: "2026-10-18T09:00:00.000Z", records: [record(t, key)] as never, dryRun: false });
    expect(out.created).toBe(1);
    const [p] = await db.q(sql`select released_at from delivery.proposal where key = ${`FLT-${key}`}`);
    expect(p.released_at ? new Date(p.released_at as string).toISOString() : null).toBe(want);
  });
  afterAll(() => db?.t.drop());

  it.each([
    ["sync_proposal", () => write("FLT-961", { committedAt: future })],
    ["mark_synced", () => markSynced(ctxFor(maya), { projectKey: "FLT", keys: ["FLT-961"], committedAt: future })],
  ])("%s refuses a committedAt in the future", async (_, call) => {
    await expect(call()).rejects.toThrow(/committedAt is in the future/);
  });

  it.each([
    ["in the future is unknown", "FLT-962", future, null],
    ["in the past is stored", "FLT-963", past, past],
  ])("a releasedAt %s", async (_, key, releasedAt, want) => {
    await write(key, { releasedAt });
    const [p] = await db.q(sql`select released_at from delivery.proposal where key = ${key}`);
    expect(p.released_at ? new Date(p.released_at as string).toISOString() : null).toBe(want);
  });
});
