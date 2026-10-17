import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime, ForbiddenError } from "@amax/core/server";
import type { Viewer } from "@amax/auth";
import { aiUsage } from "../src/usage";
import { costLabel } from "../src/usage-format";
import { getAiUsageTool } from "../src/usage-tool";

const T = "a1a1a1a1-0000-4000-8000-0000000000c1";
const MAYA = "a1a1a1a1-0000-4000-8000-0000000000c2";
const NIMAL = "a1a1a1a1-0000-4000-8000-0000000000c3";
const C1 = "a1a1a1a1-0000-4000-8000-0000000000c4";
const viewer = (userId: string, role: string) => ({ tenantId: T, userId, name: "x", email: "x", assignments: [{ role, legalEntityIds: null, departments: null }], actualRoles: [role] }) as unknown as Viewer;
const admin = { tenantId: T, userId: MAYA, roles: ["Admin"] };

describe.skipIf(!hasDb)("048 AI usage", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    await t.owner`insert into core.tenant (id, name) values (${T}, 'Lumen Labs')`;
    await t.owner`insert into auth.user (id, tenant_id, email, name) values (${MAYA}, ${T}, 'maya@lumenlabs.test', 'Maya Example'), (${NIMAL}, ${T}, 'nimal@lumenlabs.test', 'Nimal Example')`;
    await t.owner.unsafe(`insert into ai.call (tenant_id, at, user_id, conversation_id, caller, source, purpose, model, input_tokens, output_tokens, cost_usd, ok) values
      ('${T}', '2026-10-02T09:00Z', '${MAYA}', '${C1}', 'user:${MAYA}', 'chat', 'chat', 'claude-haiku-5-5', 1000, 100, 1.50, true),
      ('${T}', '2026-10-02T10:00Z', '${MAYA}', '${C1}', 'user:${MAYA}', 'chat', 'chat', 'mystery-model', 500, 50, null, true),
      ('${T}', '2026-10-03T09:00Z', '${NIMAL}', null, 'user:${NIMAL}', 'chat', 'chat', 'mystery-model', 200, 20, null, true),
      ('${T}', '2026-10-03T11:00Z', null, null, 'job:digest', 'job', 'digest', 'claude-haiku-5-5', 300, 30, 0.25, true),
      ('${T}', '2026-09-30T23:00Z', '${MAYA}', null, 'user:${MAYA}', 'chat', 'chat', 'claude-haiku-5-5', 9, 9, 9, true)`);
  });
  afterAll(() => t?.drop());

  it("AC-3 self shows only your own figures; only an Admin sees the tenant", async () => {
    const mine = await aiUsage(app, { tenantId: T, userId: NIMAL, roles: ["Engineer"] }, { scope: "self", month: "2026-10" });
    expect(mine.totals).toMatchObject({ calls: 1, people: 1 });
    expect(mine.byPerson.map((p) => p.name)).toEqual(["Nimal Example"]);
    await expect(aiUsage(app, { tenantId: T, userId: NIMAL, roles: ["Engineer", "PM"] }, { scope: "tenant", month: "2026-10" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getAiUsageTool.run(viewer(NIMAL, "Engineer"), { scope: "tenant" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("AC-4 get_ai_usage returns the screen's numbers, by person, day and conversation", async () => {
    const screen = await aiUsage(app, admin, { scope: "tenant", month: "2026-10" });
    const tool = (input: object) => getAiUsageTool.run(viewer(MAYA, "Admin"), { scope: "tenant", month: "2026-10", ...input });
    const rows = async (input: object) => ((await tool(input)) as unknown as { rows: { key: string; calls: number }[] }).rows;
    expect((await tool({})).totals).toEqual(screen.totals);
    expect(screen.totals).toMatchObject({ calls: 4, people: 2, inputTokens: 2000, outputTokens: 200 });
    expect(await rows({ groupBy: "person" })).toEqual(screen.byPerson.map((r) => ({ key: r.userId ?? "none", ...r })));
    expect((await rows({ groupBy: "day", key: "2026-10-03" })).map((r) => r.calls)).toEqual([2]);
    expect((await rows({ groupBy: "conversation" })).map((r) => [r.key, r.calls])).toEqual([[C1, 2]]);
    expect((await aiUsage(app, admin, { scope: "tenant", month: "2026-10", source: "jobs" })).totals.calls).toBe(1);
  });

  it("AC-5 a call with no known price is unknown cost, never $0", async () => {
    const u = await aiUsage(app, admin, { scope: "tenant", month: "2026-10" });
    expect(u.totals).toMatchObject({ costUsd: 1.75, unknownCostCalls: 2 });
    expect(costLabel(u.totals)).toBe("$1.75 + unknown");
    const nimal = u.byPerson.find((p) => p.userId === NIMAL)!;
    expect(nimal).toMatchObject({ costUsd: null, unknownCostCalls: 1 });
    expect(costLabel(nimal)).toBe("Unknown");
    expect(u.bySource.chat).toEqual({ costUsd: 1.5, unknownCostCalls: 2 });
  });
});
