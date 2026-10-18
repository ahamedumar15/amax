// 039: read a repo's .specclaw/changes into proposal records. Build-time tooling (node:fs), run by
// the sync CLI, never in a request path.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Phase } from "../contracts";

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
  tasks: { ref: string; title: string; done: boolean }[];
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
};

const RANK: Record<Phase, number> = { proposed: 0, planned: 1, building: 2, verified: 3, released: 4 };
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
// A missing state.json is "no phases yet"; a corrupt one is a problem to report, not an empty state.
const json = (p: string): { ok: true; value: Record<string, unknown> } | { ok: false } => {
  const text = read(p);
  if (!text) return { ok: true, value: {} };
  try { return { ok: true, value: JSON.parse(text) }; } catch { return { ok: false }; }
};

type Raw = Omit<SpecRecord, "done" | "status" | "waiting">;
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
  };
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
  const byNumber = new Map<string, Raw>();
  const take = (r: Raw | null) => {
    if (!r) return;
    const cur = byNumber.get(r.number);
    // An unreadable copy anywhere (main or an overlay) can't be ranked, so the record is skipped and
    // reported rather than silently kept at another copy's phase (review round 2).
    if (r.unreadable && cur) { byNumber.set(r.number, { ...cur, unreadable: true, source: r.source }); return; }
    if (cur?.unreadable) return;
    if (!cur || RANK[r.phase] > RANK[cur.phase] || (RANK[r.phase] === RANK[cur.phase] && r.tasksDone > cur.tasksDone)) byNumber.set(r.number, cur ? { ...r, claim: r.claim ?? cur.claim } : r);
  };
  for (const archived of [true, false]) for (const d of folders(main.dir, archived)) take(parse(main.dir, d, archived, main.ref));
  for (const o of overlays.map(src)) for (const archived of [true, false]) for (const d of folders(o.dir, archived)) if (byNumber.has(numberOf(d)) || archived) take(parse(o.dir, d, archived, o.ref));
  const done = new Set([...byNumber.values()].filter((r) => r.phase === "released").map((r) => r.number));
  return [...byNumber.values()].sort((a, b) => Number(a.number) - Number(b.number)).map((r) => {
    const waiting = r.hard.filter((h) => !done.has(h));
    const isDone = done.has(r.number);
    const status = isDone ? "done" : r.claim ? "claimed" : !r.approved ? "not approved" : waiting.length ? "blocked" : "ready";
    return { ...r, done: isDone, status, waiting };
  });
}
