import { describe, expect, it } from "vitest";
import { planWithdrawals } from "../sync/withdraw";

const row = (over: Record<string, unknown> = {}) => ({ phase: "planned", meta: { source: "main@4f2c9a1" }, synced_commit_at: "2026-10-08T09:00:00Z", ...over });
const project = (n: number, extra: Record<string, Record<string, unknown>> = {}) =>
  new Map<string, Record<string, unknown>>([...Array.from({ length: n }, (_, i) => [`FLT-${100 + i}`, row()] as const), ...Object.entries(extra)]);
const first = (n: number) => Array.from({ length: n }, (_, i) => `FLT-${100 + i}`);
const at = "2026-10-09T09:00:00Z";

// 089 review round 1 (B4, B6): one rule for the push and the self-sync, and a read that looks like "everything was
// deleted" withdraws nothing. Each row: the stored proposals, the keys the sync read, the refs it covers.
describe("089 planWithdrawals", () => {
  it.each([
    ["a gone folder last synced from the default branch", project(6), first(5), ["main"], ["FLT-105"], null],
    ["the sync read no changes", project(6), [], ["main"], [], /read no changes/],
    ["it would withdraw most of the project", project(6), first(1), ["main"], [], /withdraw 5 of 6 live proposals/],
    ["last synced from a branch", project(4, { "FLT-200": row({ meta: { source: "specclaw/200-x@51b9a07" } }) }), first(4), ["main"], [], null],
    ["the self-sync (any ref) takes that branch's gone folder", project(4, { "FLT-200": row({ meta: { source: "specclaw/200-x@51b9a07" } }) }), first(4), null, ["FLT-200"], null],
    ["Released", project(4, { "FLT-200": row({ phase: "released" }) }), first(4), ["main"], [], null],
    ["a newer commit already synced it", project(4, { "FLT-200": row({ synced_commit_at: "2026-10-10T00:00:00Z" }) }), first(4), ["main"], [], null],
    ["already withdrawn", project(4, { "FLT-200": row({ meta: { source: "main@4f2c9a1", withdrawn: true } }) }), first(4), ["main"], [], null],
  ])("%s", (_, rows, read, refs, keys, held) => {
    const named = new Set(read as string[]);
    const plan = planWithdrawals(rows, { named, refs: refs ? new Set(refs as string[]) : null, committedAt: at, read: named.size });
    expect(plan.keys).toEqual(keys);
    if (held) expect(plan.held).toMatch(held as RegExp); else expect(plan.held).toBeNull();
  });
});
