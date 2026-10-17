import { describe, expect, it } from "vitest";
import type { ReleaseRow } from "../server/queries";
import { csvCell, csvText } from "../ui/csv";
import { count } from "../ui/ProjectsPage";
import { actionFor, mapPill, mapRow, nextStep, onActiveMap, standing } from "../ui/ReleasesPage";

// 041 review round 1: pure UI logic, table-driven.
describe("CSV export neutralises formulas", () => {
  it.each([
    ["=HYPERLINK(\"http://x\")", "\"'=HYPERLINK(\"\"http://x\"\")\""],
    ["+1+2", "\"'+1+2\""],
    ["-2+3", "\"'-2+3\""],
    ["@SUM(A1)", "\"'@SUM(A1)\""],
    ["\tcmd", "\"'\tcmd\""],
    ["\rcmd", "\"'\rcmd\""],
    ["Invoice export to PDF", "\"Invoice export to PDF\""],
    ["a \"quoted\" title", "\"a \"\"quoted\"\" title\""],
    ["", "\"\""],
  ])("%j", (raw, want) => expect(csvCell(raw)).toBe(want));
  it("joins cells and rows", () => expect(csvText([["a", "=b"], ["c", "d"]])).toBe("\"a\",\"'=b\"\n\"c\",\"d\""));
});

describe("pluralise on the same count", () => {
  it.each([[0, "0 clients"], [1, "1 client"], [2, "2 clients"]])("%i", (n, want) => expect(count(n as number, "client")).toBe(want));
});

const st = (environment: string, position: number, isProd: boolean, status: string | null, at: string | null = null) => ({ environment, position, isProd, status, at, note: null, run: null });
const rel = (over: Partial<ReleaseRow>, ...stages: ReturnType<typeof st>[]): ReleaseRow =>
  ({ id: over.version ?? "r", projectId: "p1", version: "v1", projectKey: "CON", projectName: "Contoso", projectColor: "violet", proposals: 1, createdAt: "2026-10-01T00:00:00.000Z", ...over, stages });

describe("one standing for the table, the map and the pill", () => {
  const cases: [string, ReleaseRow, string | null, string | null, string][] = [
    ["nothing reached", rel({}, st("Dev", 1, false, null), st("Prod", 2, true, null)), null, null, "Deploy to Dev"],
    ["testing in QA", rel({}, st("Dev", 1, false, "deployed", "2026-10-12T09:00:00Z"), st("QA", 2, false, "testing", "2026-10-15T09:00:00Z"), st("Prod", 3, true, null)), "QA", "Testing since Oct 15", "Promote to Prod"],
    ["live in Prod", rel({}, st("Dev", 1, false, "deployed", "2026-09-22T09:00:00Z"), st("Prod", 2, true, "deployed", "2026-10-01T09:00:00Z")), "Prod", "Live since Oct 1", "Live"],
    // A stage after Prod rolled back while Prod stays deployed: every view says Live (they used to disagree).
    ["live, a later stage rolled back", rel({}, st("Prod", 1, true, "deployed", "2026-10-01T09:00:00Z"), st("Demo", 2, false, "rolled-back", "2026-10-03T09:00:00Z")), "Demo", "Live since Oct 1", "Live"],
    ["live, a later stage reached", rel({}, st("Prod", 1, true, "deployed", "2026-10-01T09:00:00Z"), st("Demo", 2, false, "deployed", "2026-10-03T09:00:00Z")), "Demo", "Live since Oct 1", "Live"],
  ];
  it.each(cases)("%s", (_, r, lastEnv, pill, action) => {
    const s = standing(r);
    expect(s.last?.environment ?? null).toBe(lastEnv);
    expect(mapPill(r)?.text ?? null).toBe(pill);
    expect(mapRow(r, r.stages.map((x) => x.environment)).stations.find((x) => x.last)?.environment ?? null).toBe(lastEnv);
    expect(nextStep(r) === null).toBe(action === "Live");
    const a = actionFor(r, true);
    expect(a.kind === "button" ? a.label : a.text).toBe(action === "Deploy to Dev" ? "Building" : action);
  });
});

describe("the action cell keeps the first deployment reachable", () => {
  const fresh = rel({ version: "v2.5.0" }, st("Dev", 1, false, null), st("Prod", 2, true, null));
  const moving = rel({}, st("Dev", 1, false, "deployed", "2026-10-12T09:00:00Z"), st("Prod", 2, true, null));
  it.each([
    ["nothing reached, may record: a link to the release page", fresh, true, { kind: "link", text: "Building", href: "/delivery/releases/CON/v2.5.0" }],
    ["nothing reached, may not record: text", fresh, false, { kind: "text", text: "Building" }],
    ["moving, may record: the button", moving, true, { kind: "button", label: "Promote to Prod", environment: "Prod" }],
    ["moving, may not record: what's next", moving, false, { kind: "text", text: "Next: to Prod" }],
  ])("%s", (_, r, allowed, want) => expect(actionFor(r, allowed)).toMatchObject(want));
});

describe("the Active map", () => {
  const now = new Date("2026-10-16T15:00:00Z");
  const live = (version: string, at: string, createdAt: string, projectId = "p1") => rel({ version, createdAt, projectId }, st("Prod", 1, true, "deployed", at));
  const moving = (version: string, createdAt: string, projectId = "p1") => rel({ version, createdAt, projectId }, st("Dev", 1, false, "deployed", "2026-10-12T09:00:00Z"), st("Prod", 2, true, null));
  const fresh = (version: string, createdAt: string) => rel({ version, createdAt }, st("Dev", 1, false, null), st("Prod", 2, true, null));
  it.each([
    ["a recent live release, nothing newer", [live("v1", "2026-10-01T09:00:00Z", "2026-09-20T00:00:00Z")], ["v1"]],
    ["a live release more than 45 days old", [live("v1", "2026-08-20T09:00:00Z", "2026-08-01T00:00:00Z")], []],
    ["a live release superseded by a newer one that is moving", [moving("v2", "2026-10-05T00:00:00Z"), live("v1", "2026-10-01T09:00:00Z", "2026-09-20T00:00:00Z")], ["v2"]],
    ["a newer release not deployed anywhere does not supersede", [fresh("v2", "2026-10-05T00:00:00Z"), live("v1", "2026-10-01T09:00:00Z", "2026-09-20T00:00:00Z")], ["v1"]],
    ["another project's newer release does not supersede", [moving("v9", "2026-10-05T00:00:00Z", "p2"), live("v1", "2026-10-01T09:00:00Z", "2026-09-20T00:00:00Z")], ["v9", "v1"]],
  ])("%s", (_, releases, want) => expect(onActiveMap(releases as ReleaseRow[], now).map((r) => r.version)).toEqual(want));
});
