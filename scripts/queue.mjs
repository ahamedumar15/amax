#!/usr/bin/env node
import { execSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { CH, describe, load } from "./queue/state.mjs";

const sh = (c) => execSync(c, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : undefined; };
const machine = arg("--machine") ?? hostname();
const sync = () => { sh("git fetch -q origin main"); sh("git pull -q --rebase origin main"); };

function status() {
  sync();
  for (const it of load()) console.log(`${it.dir.padEnd(32)} ${it.lane.padEnd(13)} ${describe(it)}`);
}

function claim(pick) {
  writeFileSync(`${CH}/${pick.dir}/claim.md`, `# Claim\n\nmachine: ${machine}\nclaimed: ${new Date().toISOString()}\n`);
  sh(`git add ${CH}/${pick.dir}/claim.md`);
  sh(`git commit -q -m "queue: ${machine} claims ${pick.dir}"`);
  try {
    sh("git push -q origin HEAD:main");
    return true;
  } catch {
    sh("git reset -q --hard HEAD~1");
    return false;
  }
}

function next() {
  const lanes = arg("--lanes")?.split(",").map((s) => s.trim().toLowerCase());
  for (let attempt = 0; attempt < 5; attempt++) {
    sync();
    const pick = load().find((it) => it.ready && (!lanes || lanes.includes(it.lane.toLowerCase())));
    if (!pick) {
      console.log("nothing ready");
      process.exit(2);
    }
    if (claim(pick)) return console.log(pick.dir);
  }
  console.error("could not claim after 5 attempts");
  process.exit(1);
}

function release() {
  sync();
  const id = process.argv[3];
  const it = load().find((x) => x.id === id || x.dir === id);
  if (!it?.claim) return console.log("not claimed");
  if (it.claim !== machine) {
    console.error(`claimed by ${it.claim}, not ${machine}`);
    process.exit(1);
  }
  unlinkSync(`${CH}/${it.dir}/claim.md`);
  sh(`git add -A ${CH}/${it.dir}`);
  sh(`git commit -q -m "queue: ${machine} releases ${it.dir}"`);
  sh("git push -q origin HEAD:main");
  console.log(`released ${it.dir}`);
}

const commands = { status, next, release };
const cmd = commands[process.argv[2]];
if (cmd) cmd();
else console.log("usage: queue.mjs status | next --machine <name> [--lanes A,B] | release <id> --machine <name>");
