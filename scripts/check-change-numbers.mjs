#!/usr/bin/env node
// 089 AC-10: a pull request may not add a specclaw change folder whose number another folder already has, on the base
// branch's tip (even one the PR branch was cut before) or in the PR. amax keys a proposal by that number, so two
// folders can't share it (the sync skips both).
// Pairs already on the base branch are reported, not failed: renumbering them is its own decision.
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const NUMBERED = /^(\d{3,})-/;

export function changeFolders(cwd, ref) {
  const res = spawnSync("git", ["ls-tree", "--name-only", ref, ".specclaw/changes/", ".specclaw/changes/archive/"], { cwd, encoding: "utf8" });
  if (res.status !== 0) throw new Error(res.stderr.trim() || `git ls-tree ${ref} failed`);
  return [...new Set(res.stdout.split("\n").map((p) => p.split("/").at(-1)).filter((d) => NUMBERED.test(d)))];
}

const byNumber = (dirs) => dirs.reduce((m, d) => m.set(d.match(NUMBERED)[1], [...(m.get(d.match(NUMBERED)[1]) ?? []), d]), new Map());

/** What the check prints: the PR's new folders that reuse a number (fail), and the base branch's own pairs (known). */
export function check(baseDirs, headDirs) {
  const base = new Set(baseDirs);
  const added = headDirs.filter((d) => !base.has(d));
  const head = byNumber([...new Set([...baseDirs, ...headDirs])]);
  const failures = added.filter((d) => head.get(d.match(NUMBERED)[1]).length > 1)
    .map((d) => `${d}: number ${d.match(NUMBERED)[1]} is already used by ${head.get(d.match(NUMBERED)[1]).filter((o) => o !== d).join(", ")}; renumber it (specclaw-renumber-changes)`);
  const known = [...byNumber(baseDirs)].filter(([, ds]) => ds.length > 1).map(([n, ds]) => `${n}: ${ds.join(", ")} (already on the base branch)`);
  return { failures, known };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const cwd = opt("--root", process.cwd());
  const { failures, known } = check(changeFolders(cwd, opt("--base", "origin/main")), changeFolders(cwd, opt("--head", "HEAD")));
  for (const k of known) console.log(`known   ${k}`);
  for (const f of failures) console.log(`fail    ${f}`);
  console.log(failures.length ? `${failures.length} change folder(s) reuse a number` : "change numbers: ok");
  process.exit(failures.length ? 1 : 0);
}
