import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { createRegistry } from "@amax/mcp";
import delivery from "../module";
import { managerCard } from "../server/manager";
import { setUpProjectCard } from "../server/set-up-project-card";
import { proposalDb } from "./proposal-db";

describe.skipIf(!hasDb)("107 hand over the PM (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer, nimal: Viewer;
  const registry = createRegistry([delivery]);
  const hand = (v: Viewer, projectKey: string, userId: string) => registry.call(v, "set_project_manager", { projectKey, userId }, { source: "mcp" });
  beforeAll(async () => { db = await proposalDb(); maya = await db.as("maya"); nimal = await db.as("nimal"); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC1 the current PM hands CON to Nimal: he manages it at once, audited, and the event names both", async () => {
    await expect(hand(maya, "CON", nimal.userId)).resolves.toMatchObject({ projectKey: "CON", manager: "Nimal Silva" });
    const [p] = await db.q(sql`select id, manager_user_id from delivery.project where key = 'CON'`);
    expect(p.manager_user_id).toBe(nimal.userId);
    expect((await db.as("nimal")).managedProjects).toContain(p.id);
    const [audit] = await db.q(sql`select before, after from core.audit_event where action = 'delivery.project.manager' order by seq desc limit 1`);
    expect(audit).toMatchObject({ before: { managerUserId: maya.userId }, after: { managerUserId: nimal.userId } });
  });

  it("AC2 the card names who it was; someone not active is refused before the card", async () => {
    const card = await managerCard(maya, { projectKey: "FLT", userId: maya.userId });
    expect(card.title).toBe("Make Maya Fernando the PM of FLT (was Nimal Silva)");
    expect(card.look?.confirm).toBe("Make PM");
    const tool = registry.toolsFor(maya).find((t) => t.name === "set_project_manager")!;
    await expect(tool.propose!(maya as never, { projectKey: "FLT", userId: randomUUID() } as never)).rejects.toMatchObject({ field: "userId" });
  });

  it("AC9 once 106's card sets a project up, its receipt offers to add the team", async () => {
    const card = await setUpProjectCard(maya, { key: "NWP", name: "Northwind Portal" });
    expect(card.look?.next).toEqual({ label: "Add your team?", prompt: "Add someone to NWP" });
  });

  it("AC10 a PM hands over only a project they manage; an Engineer gets no tool", async () => {
    await expect(hand(nimal, "HRI", nimal.userId)).rejects.toThrow(/forbidden|scope/i);
    expect(registry.toolsFor(await db.as("kasun")).map((t) => t.name)).not.toContain("set_project_manager");
  });
});
