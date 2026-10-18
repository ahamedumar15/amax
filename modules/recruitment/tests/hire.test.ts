import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { acceptSuggestion } from "@amax/agents/server";
import { getApplication } from "../server/queries";
import { ctxFor } from "../server/read";
import { sharedDb } from "./db";

describe.skipIf(!hasDb)("hire to HR (Postgres)", () => {
  const use = sharedDb();

  it("AC1 recruitment.hired asks HR to confirm the HR record as a suggestion; HR's add_person then links the hire through the HR contract", async () => {
    const db = use();
    const [hr, leadership] = [await db.as("maya", "HR"), await db.as("maya", "Leadership")];
    const [o] = await db.q(sql`select o.id, a.id as application_id from recruitment.offer o join recruitment.application a on a.id = o.application_id join recruitment.candidate c on c.id = a.candidate_id where c.name = 'Hasini Gunawardena'`);
    await db.registry.call(hr, "check_offer_signature", { offerId: o.id }, { source: "mcp" });
    await db.tick();
    const [s] = await db.q(sql`select id, proposed, title from agents.suggestion where kind = 'recruitment.hr-record' and target_id = ${o.application_id}`);
    expect(s.title).toBe("Add the new Senior .NET engineer to HR records");
    expect(s.proposed).toMatchObject({ name: "Hasini Gunawardena", title: "Senior .NET engineer", department: "Engineering", joinedOn: "2026-11-16" });
    expect(await db.q(sql`select 1 from hr.person where name = 'Hasini Gunawardena'`)).toEqual([]);

    await expect(acceptSuggestion(ctxFor(leadership), { id: s.id as string })).rejects.toThrow();
    await acceptSuggestion(ctxFor(hr), { id: s.id as string });
    expect(await getApplication(hr, o.application_id as string)).toMatchObject({ stage: "hired", hrConfirmed: true, inHr: false });

    await db.registry.call(hr, "add_person", { name: "Hasini Gunawardena", title: "Senior .NET engineer", department: "Engineering", entity: "Sri Lanka", joinedOn: "2026-11-16" }, { source: "mcp" });
    await db.tick();
    expect((await getApplication(hr, o.application_id as string))!.inHr).toBe(true);
  }, 60_000);
});
