import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { acceptSuggestion } from "@amax/agents/server";
import { EVENTS as DELIVERY } from "@amax/delivery/contracts";
import { ctxFor } from "../server/read";
import { financeDb, T } from "./db";

const emit = (db: Awaited<ReturnType<typeof financeDb>>, name: string, payload: object) => db.q(sql`insert into core.event (tenant_id, name, payload) values (${T}, ${name}, ${JSON.stringify(payload)}::jsonb)`);
const open = (db: Awaited<ReturnType<typeof financeDb>>) => db.q(sql`select id, proposed, agent_name from agents.suggestion where kind = 'finance.invoice-draft' and status = 'open' order by created_at`);

describe.skipIf(!hasDb)("billing agent drafts (Postgres)", () => {
  let db: Awaited<ReturnType<typeof financeDb>>;
  beforeAll(async () => { db = await financeDb(); await db.tick(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-2 approved time drafts a T&M invoice and a Prod release drafts its milestone invoice; each is a suggestion Finance accepts", async () => {
    const [fixture] = await open(db);
    expect([fixture.agent_name, (fixture.proposed as { amount: string }).amount]).toEqual(["Billing agent", "14200.00"]);
    const [p] = await db.q(sql`select id from delivery.project where key = 'CON'`);
    await emit(db, DELIVERY.releaseDeployed, { releaseId: p.id, projectId: p.id, version: "v2.4.0", environment: "UAT", status: "deployed", released: false });
    await db.tick();
    expect(await open(db)).toHaveLength(1);
    await emit(db, DELIVERY.releaseDeployed, { releaseId: p.id, projectId: p.id, version: "v2.4.0", environment: "Prod", status: "deployed", released: true });
    await db.tick(); await db.tick();
    const milestone = (await open(db)).find((s) => (s.proposed as { amount: string }).amount === "60000.00")!;
    const finance = await db.as("maya", "Finance");
    expect(await acceptSuggestion(ctxFor(finance), { id: milestone.id as string })).toMatchObject({ status: "accepted" });
    const [inv] = await db.q(sql`select number, subtotal, source from finance.invoice where milestone_id is not null order by number desc limit 1`);
    expect([inv.number, Number(inv.subtotal), inv.source]).toEqual(["INV-0915", 60000, "milestone"]);

    const [w] = await db.q(sql`select w.id from time.week w join auth.user u on u.id = w.user_id where u.email = 'kasun@lumenlabs.test'`);
    await db.registry.call(await db.as("sahan"), "approve_week", { weekId: w.id }, { source: "mcp" });
    await db.tick(); await db.tick();
    const [b] = await db.q(sql`select hours, amount from finance.billable b join finance.contract c on c.id = b.contract_id where c.kind = 'tm' and b.source = 'time'`);
    expect(Number(b.amount)).toBe(Number(b.hours) * 45);
    expect(Number(b.hours)).toBeGreaterThan(0);
    const tm = (await open(db)).find((s) => (s.proposed as { amount: string }).amount === (14200 + Number(b.amount)).toFixed(2));
    expect(tm).toBeDefined();
    const [old] = await db.q(sql`select count(*)::int as n from finance.draft where status = 'superseded'`);
    expect(old.n).toBe(1);
  }, 60_000);
});
