import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate, migrationScopes } from "../src/migrate";
import { freshDatabase, hasDb } from "../src/testdb";

function repo(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "amax-mig-"));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
}

describe("AC-1 migration order", () => {
  it("runs core first, then modules in dependsOn order", () => {
    const root = repo({
      "packages/db/migrations/0001_core.sql": "",
      "modules/time/module.ts": `export default { dependsOn: ["delivery", "hr"] }`,
      "modules/time/db/migrations/0001.sql": "",
      "modules/delivery/module.ts": `export default { dependsOn: [] }`,
      "modules/delivery/db/migrations/0001.sql": "",
      "modules/hr/module.ts": `export default { dependsOn: ["delivery"] }`,
      "modules/hr/db/migrations/0001.sql": "",
      "modules/hello/module.ts": `export default { dependsOn: [] }`,
    });
    expect(migrationScopes(root).map((s) => s.name)).toEqual(["core", "delivery", "hr", "time"]);
    expect(migrationScopes(root, ["hr"]).map((s) => s.name)).toEqual(["core", "delivery", "time"]);
  });

  it("rejects a dependency cycle", () => {
    const root = repo({
      "modules/a/module.ts": `dependsOn: ["b"]`, "modules/a/db/migrations/0001.sql": "",
      "modules/b/module.ts": `dependsOn: ["a"]`, "modules/b/db/migrations/0001.sql": "",
    });
    expect(() => migrationScopes(root)).toThrow(/cycle/);
  });
});

describe.skipIf(!hasDb)("AC-1 migration runner (Postgres)", () => {
  let drop = async () => {};
  afterEach(() => drop());

  it("applies each scope once, lets parallel modules reuse file names, and refuses edited files", async () => {
    const t = await freshDatabase();
    drop = t.drop;
    const root = repo({
      "modules/a/module.ts": "dependsOn: []",
      "modules/a/db/migrations/0001_init.sql": "create schema a; create table a.t (id int);",
      "modules/b/module.ts": "dependsOn: []",
      "modules/b/db/migrations/0001_init.sql": "create schema b; create table b.t (id int);",
    });
    const scopes = migrationScopes(root);
    expect(await migrate(t.owner, scopes)).toBe(2);
    expect(await migrate(t.owner, scopes)).toBe(0);
    writeFileSync(join(root, "modules/a/db/migrations/0001_init.sql"), "create schema a2;");
    await expect(migrate(t.owner, scopes)).rejects.toThrow(/changed after it was applied/);
  });

  it("rolls back a failing file and records nothing for it", async () => {
    const t = await freshDatabase();
    drop = t.drop;
    const root = repo({ "modules/a/module.ts": "", "modules/a/db/migrations/0001.sql": "create schema a; select 1/0;" });
    await expect(migrate(t.owner, migrationScopes(root))).rejects.toThrow();
    const [{ n }] = await t.owner`select count(*)::int as n from information_schema.schemata where schema_name = 'a'`;
    expect(n).toBe(0);
  });
});
