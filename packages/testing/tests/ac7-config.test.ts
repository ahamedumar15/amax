import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEnv } from "@amax/core/env";

const repo = join(__dirname, "../../..");
const standard = (root: string) => spawnSync("node", [join(repo, "scripts/check-module-standard.mjs"), "--root", root], { encoding: "utf8" });

describe("AC7 configuration and ownership", () => {
  it("AC7 bad environment fails with a clear message and the module standard is enforced", () => {
    expect(loadEnv({ AMAX_BASE_URL: "https://amax.example.dev" }).NODE_ENV).toBe("development");
    expect(() => loadEnv({ AMAX_BASE_URL: "not-a-url", PORT: "abc" })).toThrow(/AMAX_BASE_URL[\s\S]*PORT[\s\S]*Fix these variables/);
    expect(standard(repo).status).toBe(0);
    const broken = standard(join(__dirname, "../standard/missing"));
    expect(broken.status).toBe(2);
    expect(broken.stderr).toMatch(/missing README\.md[\s\S]*no CODEOWNERS line/);
  });

  it("032 AC-1 a module whose personal-data table has no retention entry fails the standard; pseudonymous ids alone don't count", () => {
    const r = standard(join(__dirname, "../standard/no-retention"));
    expect(r.status).toBe(2);
    expect(r.stderr.trim().split("\n").filter((l) => l.includes("retention"))).toEqual(["  - modules/people: personal-data table people.visit has no retention entry (032)"]);
  });

  // Review 058 B3: every way Postgres spells a table or column is read, a statement the scan can't
  // read fails the check, a comment is not a retention entry, and every entry names its subject.
  const cases: { name: string; sql: string; manifest: string; problem: RegExp | null }[] = [
    { name: "upper-case CREATE TABLE", sql: "CREATE TABLE people.visit (\n  id uuid PRIMARY KEY,\n  visitor_email text\n);", manifest: "", problem: /people\.visit has no retention entry/ },
    { name: "create table if not exists", sql: "create table if not exists people.visit (id uuid, visitor_email text);", manifest: "", problem: /people\.visit has no retention entry/ },
    { name: "one-line table", sql: "create table people.visit (id uuid primary key, visitor_email text not null);", manifest: "", problem: /people\.visit has no retention entry/ },
    { name: "alter table add without column", sql: "create table people.visit (id uuid);\nalter table people.visit add visitor_email text;", manifest: "", problem: /people\.visit has no retention entry/ },
    { name: "alter table add if not exists, quoted", sql: "create table people.visit (id uuid);\nALTER TABLE people.visit ADD COLUMN IF NOT EXISTS \"phone_home\" text;", manifest: "", problem: /people\.visit has no retention entry/ },
    { name: "a comment is not an entry", sql: "create table people.visit (id uuid, visitor_email text);", manifest: '// table: "people.visit"\nexport default { id: "people" };', problem: /people\.visit has no retention entry/ },
    { name: "an entry with no subject", sql: "create table people.visit (id uuid, visitor_email text);", manifest: 'export default { id: "people", retention: [{ table: "people.visit", fields: ["visitor_email"] }] };', problem: /people\.visit names no subject or subjectName/ },
    { name: "an unreadable create table", sql: "create table people.visit as select * from people.badge;", manifest: "", problem: /can't read "create table people\.visit as select/ },
    { name: "a findable entry passes", sql: "CREATE TABLE IF NOT EXISTS people.visit (id uuid, visitor_email text);", manifest: 'export default { id: "people", retention: [{ table: "people.visit", subject: ["id"], fields: ["visitor_email"] }] };', problem: null },
  ];
  it.each(cases)("058 the retention check: $name", ({ sql, manifest, problem }) => {
    const root = mkdtempSync(join(tmpdir(), "amax-standard-"));
    try {
      cpSync(join(__dirname, "../standard/no-retention"), root, { recursive: true });
      writeFileSync(join(root, "modules/people/db/migrations/0001_people.sql"), sql);
      writeFileSync(join(root, "modules/people/module.ts"), manifest || 'export default { id: "people" };');
      const r = standard(root);
      if (problem) {
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(problem);
      } else expect(r.status, r.stderr).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // Review 058 round 2: the check runs when started through a path with a space or a symlink; it must
  // never exit 0 without checking.
  it.each([["a space", "with space"], ["a symlink", "link"], ["both", "a link with space"]])("runs the check through %s", (_, name) => {
    const dir = mkdtempSync(join(tmpdir(), "amax-cli-"));
    try {
      const at = join(dir, name);
      symlinkSync(repo, at);
      const r = spawnSync("node", [join(at, "scripts/check-module-standard.mjs"), "--root", join(__dirname, "../standard/missing")], { encoding: "utf8" });
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/missing README\.md/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

