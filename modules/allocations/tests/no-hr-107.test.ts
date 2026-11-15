import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { upsertPasswordUser } from "@amax/auth";
import type { ModuleManifest } from "@amax/core";
import { createRegistry } from "@amax/mcp";
import allocations from "../module";
import { allocationsDatabase, T } from "./setup";

describe.skipIf(!hasDb)("107 someone with no HR record (Postgres)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  let registry: ReturnType<typeof createRegistry>;
  beforeAll(async () => {
    db = await allocationsDatabase();
    const hr = (await import("@amax/hr/module")).default as ModuleManifest;
    registry = createRegistry([hr, allocations]);
    await upsertPasswordUser(db.app, T, { email: "priya@lumenlabs.test", name: "Priya Jayasena", roles: ["Engineer"], password: "a-long-password-1234" });
  }, 60_000);
  afterAll(() => db?.t.drop());
  const tool = async (name: string) => registry.toolsFor(await db.as("maya")).find((t) => t.name === name)!;

  it("AC8 the card names someone who can sign in but isn't in HR, and points to adding them first; no one at all is said plainly", async () => {
    const allocate = await tool("allocate");
    const maya = await db.as("maya");
    await expect(allocate.propose!(maya as never, { person: "Priya Jayasena", projectKey: "CON" } as never))
      .rejects.toMatchObject({ field: "person", message: expect.stringMatching(/Priya Jayasena can sign in but has no HR record yet\. Add them to HR first: "add Priya Jayasena to HR for CON"/) });
    await expect(allocate.propose!(maya as never, { person: "Nobody Atall" } as never)).rejects.toMatchObject({ field: "person", message: "No one called Nobody Atall is in HR" });
    await expect(allocate.propose!(maya as never, { person: "Kasun Dias", projectKey: "CON" } as never)).resolves.toBeUndefined();
  });

  it("AC8 Add to HR links their sign-in by work email and its receipt offers the project next; then the allocate card accepts them", async () => {
    const maya = await db.as("maya");
    const add = await tool("add_person");
    const card = await add.card!(maya as never, { name: "Priya Jayasena", workEmail: "priya@lumenlabs.test", forProject: "CON" } as never);
    expect(card.look?.next).toEqual({ label: "Add Priya Jayasena to CON", prompt: "Add Priya Jayasena to CON" });
    await registry.call(maya, "add_person", { name: "Priya Jayasena", title: "Engineer", department: "Engineering", entity: "Sri Lanka", workEmail: "priya@lumenlabs.test", forProject: "CON" }, { source: "mcp" });
    const [p] = await db.tx((tx) => tx.execute(sql`select p.user_id, u.email from hr.person p join auth.user u on u.id = p.user_id where p.name = 'Priya Jayasena'`));
    expect(p?.email).toBe("priya@lumenlabs.test");
    await expect((await tool("allocate")).propose!(maya as never, { person: "Priya Jayasena", projectKey: "CON" } as never)).resolves.toBeUndefined();
  });
});
