// 039: read a repo's .specclaw/changes into proposal records. Build-time tooling (node:fs), run by
// the sync CLI, never in a request path.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Phase } from "../contracts";
import { ownerFromHeader } from "./owner-line";

export type SpecRecord = {
  number: string;
  dir: string;
  title: string;
  lane: string;
  module: string;
  phase: Phase;
  approved: boolean;
  claim: string | null;
  hard: string[];
  optional: string[];
  tasksDone: number;
  tasksTotal: number;
  /** 008: each task by id, as sync_proposal stores it. */
  tasks: { ref: string; title: string; done: boolean; doneAt?: string | null }[];
  acs: number;
  pr: string | null;
  verdict: string | null;
  done: boolean;
  /** Same rules as scripts/queue/state.mjs. */
  status: "done" | "claimed" | "not approved" | "blocked" | "ready";
  waiting: string[];
  updatedAt: string | null;
  releasedAt: string | null;
  /** Where this record was read: "main@<sha>" or "specclaw/<change>@<sha>" (review round 1). */
  source: string;
  /** state.json existed but couldn't be parsed: the record is reported, never synced. */
  unreadable: boolean;
  /** 089 AC-8: another change folder has the same number, so neither can own the key; both are reported, never synced. */
  duplicate: boolean;
  /** 094 AC-1: when the change was written: its `**Created:**` header, else state.json's proposal time; git fills the rest. */
  createdAt: string | null;
  /** 094 AC-3: when each phase was reached in the repo (state.json), by phase: proposal, tasks, verify, pr, archived. */
  phaseTimes: Record<string, string>;
  /** 091 AC-7: the email on the header's `**Owner:**` line, if any. */
  owner: string | null;
  /** 091 AC-7: who added the change's change.md, from git; filled by the plugin's reader and CI, never by this file reader. */
  author?: string | null;
};

const RANK: Record<Phase, number> = { proposed: 0, planned: 1, building: 2, verified: 3, released: 4 };
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
// A missing state.json is "no phases yet"; a corrupt one is a problem to report, not an empty state.
const json = (p: string): { ok: true; value: Record<string, unknown> } | { ok: false } => {
  const text = read(p);
  if (!text) return { ok: true, value: {} };
  try { return { ok: true, value: JSON.parse(text) }; } catch { return { ok: false }; }
};

type Raw = Omit<SpecRecord, "done" | "status" | "waiting" | "duplicate">;
export type Source = { dir: string; ref: string };

function parse(root: string, dir: string, archived: boolean, ref: string): Raw | null {
  const base = join(root, ".specclaw/changes", archived ? "archive" : "", dir);
  const change = read(join(base, "change.md"));
  if (!change) return null;
  const head = change.split("\n")[3] ?? "";
  const [hardPart, optPart = ""] = head.split("**Integrates with");
  const ids = (s: string) => (s.match(/\[(\d{3,})\]/g) ?? []).map((x) => x.slice(1, -1));
  const status = read(join(base, "status.md"));
  const parsedState = json(join(base, "state.json"));
  const state = parsedState.ok ? parsedState.value : {};
  const phases = (state.phases ?? {}) as Record<string, { status?: string; at?: string; url?: string }>;
  const tasks = [...change.matchAll(/^- \[( |x)\] `T\d+`/gm)];
  const claim = read(join(base, "claim.md")).match(/machine: (\S+)/)?.[1] ?? null;
  const approved = archived || /\|\s*Proposal\s*\|\s*✅ Approved/.test(status);
  const tasksDone = tasks.filter((t) => t[1] === "x").length;
  const verified = phases.verify?.status === "done" || phases.pr?.status === "raised";
  const phase: Phase = archived ? "released" : verified ? "verified" : claim || tasksDone > 0 || phases.build ? "building" : approved ? "planned" : "proposed";
  const stamps = Object.values(phases).map((p) => p.at).filter(Boolean).sort();
  return {
    number: numberOf(dir),
    dir,
    title: (change.match(/^# (.+)$/m)?.[1] ?? dir).trim(),
    lane: (head.match(/\*\*Lane:\*\* ([^·]+)/) ?? [])[1]?.trim() ?? "",
    module: (head.match(/\*\*Module:\*\* `([^`]+)`/) ?? [])[1] ?? "",
    phase,
    approved,
    claim: archived ? null : claim,
    hard: ids(hardPart.split("**Depends on:**")[1] ?? ""),
    optional: ids(optPart),
    tasksDone,
    tasksTotal: tasks.length,
    tasks: [...change.matchAll(/^- \[( |x)\] `(T\d+)`\s*[—-]\s*(.+)$/gm)].map((t) => ({ ref: t[2], title: t[3].trim(), done: t[1] === "x" })),
    acs: (change.match(/^\d+\. \*\*AC-\d+\*\*/gm) ?? []).length,
    pr: phases.pr?.url ?? status.match(/\|\s*PR\s*\|[^|]*\|\s*(https:\/\/\S+?)\s*\|/)?.[1] ?? null,
    verdict: change.match(/\*\*Verdict:\*\* (\w+)/)?.[1] ?? null,
    updatedAt: stamps.at(-1) ?? null,
    releasedAt: archived ? phases.archived?.at ?? stamps.at(-1) ?? null : null,
    source: ref,
    unreadable: !parsedState.ok,
    createdAt: createdOf(change, phases),
    phaseTimes: phaseTimesOf(phases),
    // 091 AC-7, 094 AC-5: the email on the header's Owner line, read by tokens (owner-line.ts).
    owner: ownerFromHeader(change),
  };
}

// 094 AC-3: the phases a change reached in the repo, and when: approved, tasks planned, verified, PR raised, archived.
const REACHED: Record<string, string> = { proposal: "approved", tasks: "done", verify: "done", pr: "raised", archived: "done" };
const isTime = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
function phaseTimesOf(phases: Record<string, { status?: string; at?: string }>) {
  const out: Record<string, string> = {};
  for (const [k, status] of Object.entries(REACHED)) if (phases[k]?.status === status && isTime(phases[k].at)) out[k] = new Date(phases[k].at!).toISOString();
  return out;
}
// 094 AC-1: the header's Created day, else the proposal's time in state.json. The header is only a day, so when
// state.json's proposal time falls on it, that time says when on the day; otherwise the day reads as midnight UTC.
function createdOf(change: string, phases: Record<string, { at?: string }>) {
  const day = change.split(/^## /m)[0].match(/\*\*Created:\*\*\s*(\d{4}-\d{2}-\d{2})\b/)?.[1];
  const proposed = isTime(phases.proposal?.at) ? new Date(phases.proposal!.at!).toISOString() : null;
  if (day && isTime(`${day}T00:00:00Z`)) return proposed?.startsWith(day) ? proposed : `${day}T00:00:00.000Z`;
  return proposed;
}

// "042-release-management" is change 042; numbers past 999 keep all their digits (review round 6).
const numberOf = (dir: string) => dir.match(/^(\d{3,})-/)![1];

const folders = (root: string, archived: boolean) => {
  const p = join(root, ".specclaw/changes", archived ? "archive" : "");
  return existsSync(p) ? readdirSync(p).filter((d) => /^\d{3,}-/.test(d)) : [];
};

/**
 * Records for every change in `root` (usually main), each replaced by the same change's state in an
 * overlay (its specclaw/<change> branch) when that one is further along.
 */
export function readSpecclaw(root: string | Source, overlays: (string | Source)[] = []): SpecRecord[] {
  const src = (x: string | Source): Source => (typeof x === "string" ? { dir: x, ref: x } : x);
  const main = src(root);
  // 089 AC-8: copies are merged by folder name, so an overlay of the same folder is the same change, and two folders
  // that share a number stay two records instead of one silently replacing the other.
  const byDir = new Map<string, Raw>();
  const take = (r: Raw | null) => {
    if (!r) return;
    const cur = byDir.get(r.dir);
    // An unreadable copy anywhere (main or an overlay) can't be ranked, so the record is skipped and
    // reported rather than silently kept at another copy's phase (review round 2).
    if (r.unreadable && cur) { byDir.set(r.dir, { ...cur, unreadable: true, source: r.source }); return; }
    if (cur?.unreadable) return;
    if (!cur || RANK[r.phase] > RANK[cur.phase] || (RANK[r.phase] === RANK[cur.phase] && r.tasksDone > cur.tasksDone)) byDir.set(r.dir, cur ? { ...r, claim: r.claim ?? cur.claim } : r);
  };
  for (const archived of [true, false]) for (const d of folders(main.dir, archived)) take(parse(main.dir, d, archived, main.ref));
  for (const o of overlays.map(src)) for (const archived of [true, false]) for (const d of folders(o.dir, archived)) if (byDir.has(d) || archived) take(parse(o.dir, d, archived, o.ref));
  const all = [...byDir.values()];
  const perNumber = new Map<string, number>();
  for (const r of all) perNumber.set(r.number, (perNumber.get(r.number) ?? 0) + 1);
  const done = new Set(all.filter((r) => r.phase === "released").map((r) => r.number));
  return all.sort((a, b) => Number(a.number) - Number(b.number) || (a.dir < b.dir ? -1 : 1)).map((r) => {
    const waiting = r.hard.filter((h) => !done.has(h));
    const isDone = done.has(r.number);
    const status = isDone ? "done" : r.claim ? "claimed" : !r.approved ? "not approved" : waiting.length ? "blocked" : "ready";
    return { ...r, done: isDone, status, waiting, duplicate: perNumber.get(r.number)! > 1 };
  });
}
