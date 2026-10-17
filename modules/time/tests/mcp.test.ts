import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRegistry } from "@amax/mcp";
import manifest from "../module";
import { timeDb } from "./db";

describe.skipIf(!hasDb)("MCP tools (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); });
  afterAll(() => db?.t.drop());

  it("AC4 log_time, submit_week and approve_week run as the caller, audited, and MCP time counts as agent time", async () => {
    const registry = createRegistry([manifest]);
    const [maya, tharushi, liam] = await Promise.all([db.as("maya", "PM"), db.as("tharushi"), db.as("liam")]);
    expect(registry.toolsFor(tharushi).map((t) => t.name)).toEqual(expect.arrayContaining(["log_time", "submit_week", "get_my_week"]));
    await registry.call(tharushi, "log_time", { projectKey: "FLT", day: "2026-10-16", hours: 1.5, agent: "Claude for Tharushi" }, { source: "mcp" });
    const [entry] = await db.q(sql`select source, agent, hours from time.entry where day = '2026-10-16' and logged_by = ${`user:${tharushi.userId}`}`);
    expect(entry).toEqual({ source: "agent", agent: "Claude for Tharushi", hours: "1.50" });
    await registry.call(tharushi, "submit_week", { week: "2026-W42" }, { source: "mcp" });
    await expect(registry.call(liam, "approve_week", { person: "tharushi@lumenlabs.test", week: "2026-W42" }, { source: "mcp" })).rejects.toThrow(/forbidden/);
    await expect(registry.call(maya, "approve_week", { person: "tharushi@lumenlabs.test", week: "2026-W42" }, { source: "mcp" })).resolves.toMatchObject({ status: "approved" });
    const audit = await db.q(sql`select action, source from core.audit_event where action like 'time.%' order by seq`);
    expect(audit).toEqual([{ action: "time.entry.log", source: "mcp" }, { action: "time.week.submit", source: "mcp" }, { action: "time.week.approve", source: "mcp" }]);
    const mine = (await registry.call(tharushi, "get_my_week", { week: "2026-W42" }, { source: "mcp" })) as { total: number; status: string };
    expect(mine).toMatchObject({ total: 30.5, status: "approved" });
  });
});
