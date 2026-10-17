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
  acs: number;
  pr: string | null;
  verdict: string | null;
  done: boolean;
  /** Same rules as scripts/queue/state.mjs. */
  status: "done" | "claimed" | "not approved" | "blocked" | "ready";
  waiting: string[];
  updatedAt: string | null;
  releasedAt: string | null;
};

const RANK: Record<Phase, number> = { proposed: 0, planned: 1, building: 2, verified: 3, released: 4 };
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const json = (p: string) => { try { return JSON.parse(read(p) || "{}"); } catch { return {}; } };

type Raw = Omit<SpecRecord, "done" | "status" | "waiting">;

function parse(root: string, dir: string, archived: boolean): Raw | null {
  const base = join(root, ".specclaw/changes", archived ? "archive" : "", dir);
  const change = read(join(base, "change.md"));
  if (!change) return null;
  const head = change.split("\n")[3] ?? "";
  const [hardPart, optPart = ""] = head.split("**Integrates with");
  const ids = (s: string) => (s.match(/\[(\d{3})\]/g) ?? []).map((x) => x.slice(1, 4));
  const status = read(join(base, "status.md"));
  const state = json(join(base, "state.json"));
  const phases = (state.phases ?? {}) as Record<string, { status?: string; at?: string; url?: string }>;
  const tasks = [...change.matchAll(/^- \[( |x)\] `T\d+`/gm)];
  const claim = read(join(base, "claim.md")).match(/machine: (\S+)/)?.[1] ?? null;
  const approved = archived || /\|\s*Proposal\s*\|\s*✅ Approved/.test(status);
  const tasksDone = tasks.filter((t) => t[1] === "x").length;
  const verified = phases.verify?.status === "done" || phases.pr?.status === "raised";
  const phase: Phase = archived ? "released" : verified ? "verified" : claim || tasksDone > 0 || phases.build ? "building" : approved ? "planned" : "proposed";
  const stamps = Object.values(phases).map((p) => p.at).filter(Boolean).sort();
  return {
    number: dir.slice(0, 3),
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
    acs: (change.match(/^\d+\. \*\*AC-\d+\*\*/gm) ?? []).length,
    pr: phases.pr?.url ?? status.match(/\|\s*PR\s*\|[^|]*\|\s*(https:\/\/\S+?)\s*\|/)?.[1] ?? null,
    verdict: change.match(/\*\*Verdict:\*\* (\w+)/)?.[1] ?? null,
    updatedAt: stamps.at(-1) ?? null,
    releasedAt: archived ? phases.archived?.at ?? stamps.at(-1) ?? null : null,
  };
}

const folders = (root: string, archived: boolean) => {
  const p = join(root, ".specclaw/changes", archived ? "archive" : "");
  return existsSync(p) ? readdirSync(p).filter((d) => /^\d{3}-/.test(d)) : [];
};

/**
 * Records for every change in `root` (usually main), each replaced by the same change's state in an
 * overlay (its specclaw/<change> branch) when that one is further along.
 */
export function readSpecclaw(root: string, overlays: string[] = []): SpecRecord[] {
  const byNumber = new Map<string, Raw>();
  const take = (r: Raw | null) => {
    if (!r) return;
    const cur = byNumber.get(r.number);
    if (!cur || RANK[r.phase] > RANK[cur.phase] || (RANK[r.phase] === RANK[cur.phase] && r.tasksDone > cur.tasksDone)) byNumber.set(r.number, cur ? { ...r, claim: r.claim ?? cur.claim } : r);
  };
  for (const archived of [true, false]) for (const d of folders(root, archived)) take(parse(root, d, archived));
  for (const o of overlays) for (const archived of [true, false]) for (const d of folders(o, archived)) if (byNumber.has(d.slice(0, 3)) || archived) take(parse(o, d, archived));
  const done = new Set([...byNumber.values()].filter((r) => r.phase === "released").map((r) => r.number));
  return [...byNumber.values()].sort((a, b) => a.number.localeCompare(b.number)).map((r) => {
    const waiting = r.hard.filter((h) => !done.has(h));
    const isDone = done.has(r.number);
    const status = isDone ? "done" : r.claim ? "claimed" : !r.approved ? "not approved" : waiting.length ? "blocked" : "ready";
    return { ...r, done: isDone, status, waiting };
  });
}
