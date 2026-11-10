import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { ctxFor } from "../server/context";
import { resolveRepoPhases } from "../server/repo-time";
import { markSynced, syncProposal } from "../server/services";
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
    ["made-up text", "the repo", null],
    ["a ref with no sha", "main@", null],
    ["not hex", "main@zzzzzzz", null],
    ["absent", undefined, null],
  ])("%s", (_, source, want) => {
    expect(resolveRepoPhases({ pr: later }, source, null)?.pr?.source).toBe(want);
  });

  it("a stored read that isn't one is dropped, the time kept", () => {
    expect(resolveRepoPhases(undefined, null, { pr: { at: later, source: "made up" } })).toEqual({ pr: { at: later, source: null } });
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
  }, 120_000);
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
