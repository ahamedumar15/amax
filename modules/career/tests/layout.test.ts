import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CareerEvent, Project } from "../layout/events";
import { layoutTree, type Tree } from "../layout/tree";
import { HISTORY, PROPOSED } from "../fixtures/kasun";

const html = readFileSync(join(import.meta.dirname, "../../../.specclaw/mock/index.html"), "utf8");
const mock = html.slice(html.indexOf('id="066-career-tree"'), html.indexOf("<!-- ================= 006 Agent governance"));
const all = (re: RegExp) => [...mock.matchAll(new RegExp(re.source, "g"))].map((m) => m.slice(1));
const kasun = HISTORY.map((e): CareerEvent => e.kind === "project" && e.project === PROPOSED.project
  ? { ...e, technologies: [...e.technologies, ...PROPOSED.names.map((name) => ({ name, proposed: true }))] } : e);
const project = (n: number, from: number, to: number, percent = 50): Project => ({ id: `p${n}`, kind: "project", on: "2020-01-01", project: `P${n}`, name: `P${n}`, client: null, technologies: [],
  months: Array.from({ length: to - from + 1 }, (_, i) => ({ month: `${2020 + Math.floor((from + i) / 12)}-${String(((from + i) % 12) + 1).padStart(2, "0")}-01`, percent })), trace: HISTORY[0].trace });
const joined = { ...HISTORY[0], on: "2020-01-01" } as CareerEvent;
const clash = (t: Tree) => t.branches.some((a, i) => t.branches.slice(i + 1).some((b) => a.side === b.side && a.lane === b.lane && a.start <= b.end && b.start <= a.end));

describe("AC-2 the layout is a pure function from events to geometry", () => {
  it("AC2 draws the fixture as the mock does, merges months, never shares a lane and goes compact above 4 lanes a side", () => {
    const t = layoutTree(kasun, "2026-10-16");
    expect(t.viewBox).toBe(mock.match(/svg class="ct" viewBox="([^"]+)"/)![1]);
    expect(t.branches.map((b) => [b.name, b.side, b.lane])).toEqual([["Contoso Portal", -1, 1], ["Northwind Claims", 1, 1], ["Fleet Tracker", -1, 1], ["Internal Design System", 1, 1], ["Adatum claims spike", -1, 2]]);
    expect(t.branches.map((b) => b.d)).toEqual(all(/class="branch" d="([^"]+)"/).map(([d]) => d));
    expect(t.branches.map((b) => b.width.toFixed(1))).toEqual(all(/class="branch" d="[^"]+" style="stroke-width:([\d.]+)"/).map(([w]) => w));
    expect(t.branches.find((b) => b.name === "Adatum claims spike")!.crosses).toEqual([t.branches[2].key]);
    expect(t.branches.flatMap((b) => b.leaves.map((l) => [l.cx.toFixed(1), l.cy.toFixed(1), l.proposed]))).toEqual(all(/class="lf( prop)?" cx="([\d.]+)" cy="([\d.]+)"/).map(([p, x, y]) => [x, y, !!p]));
    const leaves = t.branches.flatMap((b) => b.leaves);
    expect(new Set(leaves.map((l) => l.name)).size).toBe(9);
    expect(leaves.every((l) => leaves.filter((o) => o.name === l.name).every((o) => o.colour === l.colour))).toBe(true);
    expect(t.trunk).toBe(mock.match(/class="trunk" points="([^"]+)"/)![1]);
    expect(t.rings.map((r) => [r.grade, r.y.toFixed(1)])).toEqual([["Associate Engineer", "470.0"], ["Engineer", "386.8"], ["Senior Engineer", "252.4"]]);
    expect(t.fruit.map((f) => [f.x, f.y.toFixed(1), f.expired])).toEqual(all(/class="fruit( old)?" x="[\d.]+" y="[\d.]+" width="12" height="12" transform="rotate\(45 (\d+) ([\d.]+)\)"/).map(([o, x, y]) => [Number(x), y, !!o]));
    expect(t.roots.map((r) => [r.label, r.sub, r.x.toFixed(1), r.y.toFixed(1)])).toEqual(all(/<circle class="rn" cx="([\d.]+)" cy="([\d.]+)" r="4"\/><text class="pj" [^>]+>([^<]+)<\/text><text class="sub" [^>]+>([^<]+)</).map(([x, y, l, s]) => [l, s, x, y]));
    expect(t.compact).toBe(false);

    const gap = layoutTree([joined, { ...project(1, 0, 2), months: [...project(1, 0, 1).months, ...project(1, 4, 5).months] }], "2020-12-01");
    expect(gap.branches.map((b) => [b.start, b.end])).toEqual([[0, 1], [4, 5]]);
    expect(layoutTree([joined, project(1, 0, 3)], "2020-02-15").branches.map((b) => [b.end, b.open])).toEqual([[1, true]]);
    expect(layoutTree([joined, { ...kasun[3], on: "2020-03-01" }], "2020-06-01").fruit[0]).toMatchObject({ x: 410, on: null });

    const eight = layoutTree([joined, ...Array.from({ length: 8 }, (_, i) => project(i, i, 30))], "2022-01-01");
    expect([eight.compact, Math.max(...eight.branches.map((b) => b.lane)), clash(eight)]).toEqual([false, 4, false]);
    const ten = layoutTree([joined, ...Array.from({ length: 10 }, (_, i) => project(i, i, 30, 10 * (i + 1)))], "2022-01-01");
    expect([ten.compact, clash(ten), ten.branches.every((b) => b.x >= 40 && b.x <= 780 && b.label === null)]).toEqual([true, false, true]);
    expect(ten.branches.map((b) => b.width.toFixed(1))).toEqual(Array.from({ length: 10 }, (_, i) => (1.9 + 0.4 * i).toFixed(1)));
  });
});
