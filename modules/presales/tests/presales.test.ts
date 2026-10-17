import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, tablesMissingRls } from "@amax/db/testdb";
import { ValidationError } from "@amax/core/server";
import { createRegistry } from "@amax/mcp";
import type { Viewer } from "@amax/auth";
import { getOpportunityRef, pipelineTotals } from "../contracts";
import { ctxFor } from "../server/context";
import { addRisk, setRiskStatus } from "../server/records";
import { createOpportunity, moveOpportunity, removeOpportunity } from "../server/opportunities";
import { promoteToDelivery, PromotionUnavailableError, type CreateProject } from "../server/promote";
import { historyOf } from "../server/queries";
import { acceptSuggestion } from "../server/suggestions";
import { presalesDb } from "./db";

describe.skipIf(!hasDb)("presales against Postgres", () => {
  let db: Awaited<ReturnType<typeof presalesDb>>;
  let liam: Viewer, maya: Viewer;
  beforeAll(async () => {
    db = await presalesDb();
    [liam, maya] = [await db.as("liam"), await db.as("maya", "PM")];
  });
  afterAll(() => db?.t.drop());
  const ref = (n: string) => db.tx((tx) => getOpportunityRef(tx, n));

  it("AC-1 the schema is tenant-isolated, history logs who and when, and health comes from risks", async () => {
    expect(await tablesMissingRls(db.t.owner)).toEqual([]);
    const tables = await db.t.owner`select table_name from information_schema.tables where table_schema = 'presales' order by 1`;
    expect(tables.map((r) => r.table_name)).toEqual(["activity", "client", "fx_rate", "opportunity", "pipeline_snapshot", "risk", "stage_change", "suggestion", "task"]);
    const northwind = (await ref("PS-0142"))!;
    const history = await historyOf(liam, northwind.id);
    expect(history.map((h) => [h.to, h.toChance, h.byName, h.at.slice(0, 10)]).reverse()).toEqual([
      ["new-idea", 10, "Liam Murphy", "2026-08-04"], ["lead", 20, "Liam Murphy", "2026-08-07"], ["qualified", 30, "Maya Fernando", "2026-08-21"],
      ["qualified", 40, "Maya Fernando", "2026-09-12"], ["proposal", 60, "Maya Fernando", "2026-10-02"],
    ]);
    expect(northwind.health).toBe("amber");
    const ctx = ctxFor(liam);
    const issue = await addRisk(ctx, { number: "PS-0142", kind: "issue", title: "Sponsor left", impact: "high", status: "open" });
    expect((await ref("PS-0142"))!.health).toBe("red");
    await setRiskStatus(ctx, { number: "PS-0142", riskId: issue.id, status: "closed" });
    const [budget] = await db.q(sql`select id from presales.risk where title = 'Client budget not confirmed until December'`);
    await setRiskStatus(ctx, { number: "PS-0142", riskId: budget.id as string, status: "closed" });
    expect((await ref("PS-0142"))!.health).toBe("green");
  });

  it("AC-2 moves are explicit and audited, lost needs a reason, and promote creates a project through delivery", async () => {
    const ctx = ctxFor(liam);
    await moveOpportunity(ctx, { number: "PS-0142", to: "negotiation" });
    const [audit] = await db.q(sql`select actor, source, before, after from core.audit_event where action = 'presales.opportunity.move' order by seq desc limit 1`);
    expect(audit).toMatchObject({ source: "ui", before: { stage: "proposal", winChance: 60 }, after: { stage: "negotiation", winChance: 80 } });
    await expect(moveOpportunity(ctx, { number: "PS-0142", to: "lost" })).rejects.toBeInstanceOf(ValidationError);
    await moveOpportunity(ctx, { number: "PS-0142", to: "lost", reason: "Price", competitor: "Regional consultancy" });
    expect(await ref("PS-0142")).toMatchObject({ stage: "lost", winChance: 0 });
    const [lost] = await db.q(sql`select lost_reason, closed_at from presales.opportunity where number = 142`);
    expect(lost.lost_reason).toBe("Price");
    await expect(moveOpportunity(ctx, { number: "PS-0142", to: "proposal" })).rejects.toThrow(/stays closed/);
    await expect(removeOpportunity(ctx, { number: "PS-0142" })).rejects.toThrow(/win rates/);

    const input = { number: "PS-0139", key: "FAB", billing: "fixed" };
    const delivery = createRegistry(db.modules);
    const create: CreateProject = async (c, p) => (await delivery.call(c.viewer as Viewer, "create_project", p, { source: "mcp" })) as { id: string; key: string };
    await expect(promoteToDelivery(maya, input, { create })).rejects.toThrow(/isn't won yet/);
    await moveOpportunity(ctx, { number: "PS-0139", to: "won" });
    await expect(promoteToDelivery(maya, input, { create: null })).rejects.toBeInstanceOf(PromotionUnavailableError);
    await expect(promoteToDelivery(liam, input, { create })).rejects.toThrow(/forbidden/);
    expect(await promoteToDelivery(maya, input, { create })).toEqual({ number: "PS-0139", projectKey: "FAB" });
    const [project] = await db.q(sql`select name, client, billing from delivery.project where key = 'FAB'`);
    expect(project).toEqual({ name: "Data platform, phase 2", client: "Fabrikam", billing: "fixed" });
    expect(await ref("PS-0139")).toMatchObject({ projectKey: "FAB" });
    const [event] = await db.q(sql`select payload from core.event where name = 'presales.opportunity.promoted'`);
    expect(event.payload).toMatchObject({ number: "PS-0139", projectKey: "FAB", client: "Fabrikam", leadName: "Maya Fernando", valueUsd: { amount: "320000.0000", currency: "USD" } });
    await expect(promoteToDelivery(maya, input, { create })).rejects.toThrow(/already project FAB/);
  });

  it("AC-3 values convert to USD with the original currency kept, and an agent's find is added only when accepted", async () => {
    const ctx = ctxFor(liam);
    const made = await createOpportunity(ctx, { client: "Litware", title: "Claims pilot, phase 2", value: 100000, currency: "AUD" });
    expect(made).toMatchObject({ number: "PS-0143", valueUsd: "65900.0000" });
    const [row] = await db.q(sql`select value_amount, value_currency, usd_rate, value_usd from presales.opportunity where number = 143`);
    expect(row).toEqual({ value_amount: "100000.0000", value_currency: "AUD", usd_rate: "0.65900000", value_usd: "65900.0000" });
    await expect(createOpportunity(ctx, { client: "X", title: "Y", value: 1, currency: "JPY" })).rejects.toThrow(/no USD rate for JPY/);
    const [adatum] = await db.q(sql`select id from presales.suggestion where client_name = 'Adatum'`);
    const accepted = await acceptSuggestion(ctx, { id: adatum.id as string });
    expect(await ref(accepted.number)).toMatchObject({ client: "Adatum", value: { amount: "85000.0000", currency: "AUD" }, valueUsd: { amount: "56015.0000", currency: "USD" }, stage: "new-idea" });
    await expect(acceptSuggestion(ctx, { id: adatum.id as string })).rejects.toThrow(/already accepted/);
    expect((await db.tx((tx) => pipelineTotals(tx))).count).toBe(3);
  });
});
