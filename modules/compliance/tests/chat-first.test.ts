import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry } from "@amax/mcp";
import { chatTurn, confirmAction } from "@amax/chat";
import { complianceDb, T } from "./db";

const root = join(import.meta.dirname, "..");

describe("AC6 the Compliance screen has no forms or direct writes", () => {
  it("AC6 no form, dialog or server action in the compliance UI", () => {
    expect(existsSync(join(root, "actions.ts"))).toBe(false);
    for (const f of readdirSync(join(root, "ui")).filter((n) => n.endsWith(".tsx"))) {
      const src = readFileSync(join(root, "ui", f), "utf8");
      expect([f, /<form|<dialog|"use server"|from "\.\.\/server\/(policies|risks|incidents|suppliers|evidence|chain|reminders)"/.test(src)]).toEqual([f, false]);
    }
  });
});

describe.skipIf(!hasDb)("AC6 report incident and new risk through chat (Postgres)", () => {
  let db: Awaited<ReturnType<typeof complianceDb>>;
  let registry: ReturnType<typeof createRegistry>;
  beforeAll(async () => {
    db = await complianceDb();
    registry = createRegistry(db.modules);
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
  }, 240_000);
  afterAll(() => db?.t.drop());

  it("AC6 \"report incident\" and \"new risk\" become confirm cards and write only once confirmed, audited as chat", async () => {
    expect(db.modules.find((m) => m.id === "compliance")?.chatIntents).toEqual([expect.objectContaining({ id: "compliance.report-incident", tool: "report_incident" }), expect.objectContaining({ id: "compliance.new-risk", tool: "add_risk" })]);
    const cases = [
      { who: "nimal", tool: "report_incident", input: { title: "Badge reader door left open (fictional)", personalData: false }, count: sql`select count(*)::int as n from compliance.incident where title like 'Badge reader%'`, action: "compliance.incident.report" },
      { who: "sahan", tool: "add_risk", input: { title: "DNS provider outage (fictional)", likelihood: 2, impact: 3 }, count: sql`select count(*)::int as n from compliance.risk where title like 'DNS provider%'`, action: "compliance.risk.create" },
    ];
    for (const c of cases) {
      const viewer = await db.as(c.who);
      configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name: c.tool, input: c.input }] }), () => ({ text: "Confirm?" })]), db: db.app, model: "claude-haiku-5-5" });
      const turn = await chatTurn(db.app, registry, viewer, { text: c.tool });
      expect(turn.pending.map((p) => p.tool)).toEqual([c.tool]);
      expect((await db.q(c.count))[0].n).toBe(0);
      await confirmAction(db.app, registry, viewer, turn.conversationId, turn.pending[0].id);
      expect((await db.q(c.count))[0].n).toBe(1);
      expect((await db.q(sql`select source from core.audit_event where action = ${c.action} order by seq desc limit 1`))[0].source).toBe("chat");
    }
  }, 60_000);
});
