import { cpSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { migrate, migrationScopes } from "@amax/db/migrate";
import { freshDatabase, hasDb, repoRoot } from "@amax/db/testdb";
import { fakeProvider } from "../src/fake";
import { configureAi, converse } from "../src";

const T = "a1a1a1a1-0000-4000-8000-0000000000b1";
const U = "a1a1a1a1-0000-4000-8000-0000000000b2";
const GHOST = "a1a1a1a1-0000-4000-8000-0000000000b3";
const CONVO = "a1a1a1a1-0000-4000-8000-0000000000b4";

describe.skipIf(!hasDb)("048 ai.call names the person and conversation", () => {
  let t: Awaited<ReturnType<typeof freshDatabase>>;
  afterAll(() => t?.drop());

  it("AC-1 migration 0019 backfills user_id from caller; chat calls record user and conversation", async () => {
    t = await freshDatabase();
    const core = migrationScopes(repoRoot)[0];
    const before = mkdtempSync(join(tmpdir(), "amax-0019-"));
    for (const f of readdirSync(core.dir).filter((f) => f < "0019")) cpSync(join(core.dir, f), join(before, f));
    await migrate(t.owner, [{ name: "core", dir: before }]);
    await t.owner`insert into core.tenant (id, name) values (${T}, 'Lumen Labs')`;
    await t.owner`insert into auth.user (id, tenant_id, email, name) values (${U}, ${T}, 'maya@lumenlabs.test', 'Maya Example')`;
    await t.owner.unsafe(`insert into ai.call (tenant_id, caller, source, purpose, model, ok) values
      ('${T}', 'user:${U}', 'chat', 'chat', 'm', true), ('${T}', 'user:${GHOST}', 'chat', 'chat', 'm', true), ('${T}', 'job:digest', 'job', 'x', 'm', true)`);
    await migrate(t.owner, migrationScopes(repoRoot));
    const rows = await t.owner`select caller, user_id, conversation_id from ai.call order by caller`;
    expect(rows.map((r) => [r.caller, r.user_id])).toEqual([["job:digest", null], [`user:${U}`, U], [`user:${GHOST}`, null]]);

    const app = t.app();
    await t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true)`;
    configureAi({ provider: fakeProvider(() => ({ text: "hi" })), db: app, model: "claude-haiku-5-5" });
    await converse({ tenantId: T, caller: `user:${U}`, userId: U, conversationId: CONVO, source: "chat", purpose: "chat" }, {
      instructions: "x", tools: [], messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }] });
    const [row] = await withTenant(app, T, (tx) => tx.execute(sql`select user_id, conversation_id from ai.call where conversation_id is not null`));
    expect(row).toEqual({ user_id: U, conversation_id: CONVO });
  }, 60_000);
});
