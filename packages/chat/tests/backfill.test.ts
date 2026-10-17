import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { freshDatabase, hasDb, repoRoot } from "@amax/db/testdb";
import { migrate, migrationScopes } from "@amax/db/migrate";

describe.skipIf(!hasDb)("049 migration 0020 backfill (Postgres)", () => {
  const dir = mkdtempSync(join(tmpdir(), "amax-0020-"));
  let t: Awaited<ReturnType<typeof freshDatabase>> | undefined;
  afterAll(async () => {
    await t?.drop();
    rmSync(dir, { recursive: true, force: true });
  });

  it("AC1 existing rows get a title from their first message; empty ones are archived", async () => {
    t = await freshDatabase();
    const core = join(repoRoot, "packages/db/migrations");
    cpSync(core, dir, { recursive: true, filter: (f) => !/00(2\d|[3-9]\d)_/.test(f) });
    await migrate(t.owner, [{ name: "core", dir }]);
    const [tenant] = await t.owner`insert into core.tenant (name) values ('Fictional Co') returning id`;
    const [user] = await t.owner`insert into auth.user (tenant_id, email, name) values (${tenant.id}, 'pat@fictional.test', 'Pat') returning id`;
    const said = [{ role: "user", content: [{ type: "text", text: `  Submit my   timesheet ${"w".repeat(90)}` }] }];
    await t.owner`insert into chat.conversation (tenant_id, user_id, messages) values (${tenant.id}, ${user.id}, ${t.owner.json(said)}), (${tenant.id}, ${user.id}, '[]')`;
    await migrate(t.owner, migrationScopes(repoRoot));
    const rows = await t.owner`select title, archived_at, pins from chat.conversation order by jsonb_array_length(messages) desc`;
    expect(rows[0]).toMatchObject({ title: `Submit my timesheet ${"w".repeat(60)}`, archived_at: null, pins: [] });
    expect(rows[1].title).toBeNull();
    expect(rows[1].archived_at).not.toBeNull();
  }, 60_000);
});
