import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry } from "@amax/mcp";
import { chatTurn, confirmAction } from "@amax/chat";
import manifest from "../module";
import { presalesDb, T } from "./db";

const root = join(import.meta.dirname, "..");

describe("AC-1 presales screens have no forms or direct writes", () => {
  it("AC1 no form, dialog or server action in the presales UI", () => {
    expect(existsSync(join(root, "actions.ts"))).toBe(false);
    for (const f of readdirSync(join(root, "ui")).filter((n) => n.endsWith(".tsx"))) {
      const src = readFileSync(join(root, "ui", f), "utf8");
      expect([f, /<form|<dialog|"use server"|from "\.\.\/actions"|from "\.\.\/server\/(records|opportunities|suggestions)"/.test(src)]).toEqual([f, false]);
    }
  });
});

describe.skipIf(!hasDb)("AC-3 the new write tools wait for chat's confirm (Postgres, scripted model)", () => {
  let db: Awaited<ReturnType<typeof presalesDb>>;
  beforeAll(async () => {
    db = await presalesDb();
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
  });
  afterAll(() => db?.t.drop());

  const id = async (q: ReturnType<typeof sql>) => (await db.q(q))[0].id as string;
  const cases = [
    ["close_opportunity_risk", async () => ({ number: "PS-0142", riskId: await id(sql`select id from presales.risk where title = 'Client budget not confirmed until December'`) }),
      sql`select status as v from presales.risk where title = 'Client budget not confirmed until December'`, "open", "closed", "presales.risk.status"],
    ["remove_opportunity", async () => ({ number: "PS-0137" }), sql`select (removed_at is not null)::text as v from presales.opportunity where number = 137`, "false", "true", "presales.opportunity.remove"],
    ["resolve_suggestion", async () => ({ id: await id(sql`select id from presales.suggestion where client_name = 'Adatum'`), decision: "dismiss" }),
      sql`select status as v from presales.suggestion where client_name = 'Adatum'`, "open", "dismissed", "presales.suggestion.dismiss"],
  ] as const;

  it.each(cases)("AC3 %s becomes a confirm card and writes only once confirmed, audited as chat", async (name, input, probe, before, after, action) => {
    const liam = await db.as("liam");
    const args = await input();
    configureAi({ provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name, input: args }] }), () => ({ text: "Confirm?" })]), db: db.app, model: "claude-haiku-5-5" });
    expect(manifest.mcpTools!.find((t) => t.name === name)?.scope).toBe("write");
    const registry = createRegistry(db.modules);
    const turn = await chatTurn(db.app, registry, liam, { text: `please ${name}` });
    expect(turn.pending.map((p) => p.tool)).toEqual([name]);
    expect((await db.q(probe))[0].v).toBe(before);
    await confirmAction(db.app, registry, liam, turn.conversationId, turn.pending[0].id);
    expect((await db.q(probe))[0].v).toBe(after);
    const [audit] = await db.q(sql`select source from core.audit_event where action = ${action} order by seq desc limit 1`);
    expect(audit.source).toBe("chat");
  });
});
