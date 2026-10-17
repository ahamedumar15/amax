import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRegistry } from "@amax/mcp";
import type { Viewer } from "@amax/auth";
import { ctxFor } from "../server/context";
import { createOpportunity, moveOpportunity } from "../server/opportunities";
import { withIdempotency } from "@amax/core/server";
import { claimPromotion, createKey } from "../server/claim";
import { promoteToDelivery, type CreateProject } from "../server/promote";
import { logActivity } from "../server/records";
import { closedWindow, winRateNote } from "../server/stats";
import { acceptSuggestion } from "../server/suggestions";
import { presalesDb } from "./db";

describe("review round 1: the win-rate note names the empty window", () => {
  it.each([[38, 32, "Up 6 points"], [30, 31, "Down 1 point"], [40, 40, "Same as the year before"], [38, null, "No deals closed the year before"], [null, 32, "No deals closed in the last 12 months"], [null, null, "No deals closed in the last 12 months"]] as const)(
    "now %s, before %s → %s", (now, before, note) => expect(winRateNote(now, before)).toBe(note));
});

describe.skipIf(!hasDb)("review round 1 (Postgres)", () => {
  let db: Awaited<ReturnType<typeof presalesDb>>;
  let liam: Viewer, maya: Viewer;
  beforeAll(async () => { db = await presalesDb(); [liam, maya] = [await db.as("liam"), await db.as("maya", "PM")]; });
  afterAll(() => db?.t.drop());

  it.each([["2026-10-16", 0, 8, 3], ["2026-10-16", 1, 25, 8], ["2028-02-29", 1, 2, 1], ["2028-03-01", 0, 0, 0], ["2024-02-29", 0, 0, 0]] as const)(
    "closed window ending %s, %s years back, has %s closed and %s won", async (today, back, closed, won) => {
      expect(await db.tx((tx) => closedWindow(tx, today, back))).toMatchObject({ closed, won });
    });

  it("concurrent creates and an accept each get their own number", async () => {
    const ctx = ctxFor(liam);
    const [s] = await db.q(sql`select id from presales.suggestion where client_name = 'Woodgrove Bank'`);
    const made = await Promise.all([
      ...Array.from({ length: 5 }, (_, i) => createOpportunity(ctx, { client: "Race", title: `Deal ${i}`, value: 1000 })),
      acceptSuggestion(ctx, { id: s.id as string }),
    ]);
    expect(made.map((m) => m.number).sort()).toEqual(["PS-0143", "PS-0144", "PS-0145", "PS-0146", "PS-0147", "PS-0148"]);
  });

  it("two promotes at once create one project; a failed create gives the claim back; closed deals take no new records", async () => {
    await moveOpportunity(ctxFor(liam), { number: "PS-0137", to: "won" });
    const registry = createRegistry(db.modules);
    const create: CreateProject = async (c, p) => (await registry.call(c.viewer as Viewer, "create_project", p, { source: "mcp" })) as { id: string; key: string };
    const results = await Promise.allSettled([promoteToDelivery(maya, { number: "PS-0137", key: "CRA", billing: "retainer" }, { create }), promoteToDelivery(maya, { number: "PS-0137", key: "CRB", billing: "retainer" }, { create })]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await db.q(sql`select key from delivery.project where key in ('CRA', 'CRB')`)).toHaveLength(1);

    await moveOpportunity(ctxFor(liam), { number: "PS-0139", to: "won" });
    const failing: CreateProject = async () => { throw new Error("delivery said no"); };
    await expect(promoteToDelivery(maya, { number: "PS-0139", key: "FAB", billing: "fixed" }, { create: failing })).rejects.toThrow("delivery said no");
    expect(await promoteToDelivery(maya, { number: "PS-0139", key: "FAB", billing: "fixed" }, { create })).toEqual({ number: "PS-0139", projectKey: "FAB" });
    await expect(promoteToDelivery(maya, { number: "PS-0142", key: "CON", billing: "fixed" }, { create })).rejects.toThrow(/isn't won yet/);
    await expect(logActivity(ctxFor(liam), { number: "PS-0139", title: "Late call", kind: "call", on: "2026-10-20" })).rejects.toThrow(/records are closed/);
  });

  const wonDeal = async (title: string) => {
    const o = await createOpportunity(ctxFor(liam), { client: `${title} Co`, title, value: 10 });
    await moveOpportunity(ctxFor(liam), { number: o.number, to: "won" });
    return o.number;
  };
  const projects = async (key: string) => (await db.q(sql`select id from delivery.project where key = ${key}`)).length;
  const age = (number: string) => db.q(sql`update presales.opportunity set claimed_at = now() - interval '1 hour' where number = ${Number(number.slice(3))}`);
  const real = (): CreateProject => { const registry = createRegistry(db.modules); return async (c, p) => (await registry.call(c.viewer as Viewer, "create_project", p, { source: "mcp" })) as { id: string; key: string }; };

  it.each([["one after the other", false], ["at the same time", true]] as const)("review round 3: two opportunities promoted onto one project, %s: exactly one wins", async (label, together) => {
    const shared = await real()(ctxFor(maya), { key: together ? "SHB" : "SHA", name: "Shared", client: "Shared", billing: "fixed" });
    const [a, b] = [await wonDeal(`Share ${label} A`), await wonDeal(`Share ${label} B`)];
    const same: CreateProject = async (_, p) => ({ id: shared.id, key: p.key });
    const go = (n: string) => promoteToDelivery(maya, { number: n, key: `X${n.slice(3)}`, billing: "fixed" }, { create: same }).then(() => "ok", (e: Error) => e.message);
    const outcomes = together ? await Promise.all([go(a), go(b)]) : [await go(a), await go(b)];
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(1);
  });

  it("review round 3: a slow first attempt overtaken by a same-key retry leaves one linked project; another key is refused while the claim stands", async () => {
    const n = await wonDeal("Slow deal");
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    const create = real();
    const slow: CreateProject = async (c, p) => { await gate; return create(c, p); };
    const first = promoteToDelivery(maya, { number: n, key: "SLO", billing: "fixed" }, { create: slow }).then(() => "ok", (e: Error) => e.message);
    await new Promise((r) => setTimeout(r, 200));
    await age(n);
    await expect(promoteToDelivery(maya, { number: n, key: "OTH", billing: "fixed" }, { create })).rejects.toThrow(/promote it with that key/);
    expect(await promoteToDelivery(maya, { number: n, key: "SLO", billing: "fixed" }, { create })).toEqual({ number: n, projectKey: "SLO" });
    open();
    expect(await first).toMatch(/no longer claimed/);
    expect(await projects("SLO")).toBe(1);
    expect(await projects("OTH")).toBe(0);
  });

  it.each([["the link fails after a real create", "link"], ["the process dies between create and link", "crash"]] as const)("review round 3: when %s, a retry links that project and makes no second", async (_, how) => {
    const n = await wonDeal(`Resume ${how}`);
    const key = how === "link" ? "RSL" : "RSC";
    const create = real();
    if (how === "link") {
      const [o] = await db.q(sql`select id from presales.opportunity where number = ${Number(n.slice(3))}`);
      const breakLink: CreateProject = async (c, p) => { const made = await create(c, p); await db.q(sql`update presales.opportunity set claim_token = gen_random_uuid() where id = ${o.id}`); return made; };
      await expect(promoteToDelivery(maya, { number: n, key, billing: "fixed" }, { create: breakLink })).rejects.toThrow(/no longer claimed/);
    } else {
      const claim = await claimPromotion(ctxFor(maya), { number: n, key });
      await withIdempotency(createKey(claim.opportunityId, key), () => create(ctxFor(maya), { key, name: "x", client: "y", billing: "fixed" }));
    }
    await age(n);
    expect(await promoteToDelivery(maya, { number: n, key, billing: "fixed" }, { create })).toEqual({ number: n, projectKey: key });
    expect(await projects(key)).toBe(1);
  });

  it("review round 3: a key held by another project is refused and the claim is given back", async () => {
    const n = await wonDeal("Taken key deal");
    await expect(promoteToDelivery(maya, { number: n, key: "CON", billing: "fixed" }, { create: real() })).rejects.toThrow(/already has a project CON/);
    expect(await promoteToDelivery(maya, { number: n, key: "TKN", billing: "fixed" }, { create: real() })).toEqual({ number: n, projectKey: "TKN" });
  });
});
