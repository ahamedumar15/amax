import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import manifest from "../module";
import { careerHref, EVENTS, technologiesOf, type TechnologyTagged } from "../contracts";
import { sharedDb } from "./db";

describe.skipIf(!hasDb)("AC-1 contract (Postgres)", () => {
  const use = sharedDb();

  it("AC1 publishes its events and route, reads tags, and a tag emits the published payload", async () => {
    const db = use();
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
    expect(Object.keys(manifest.events?.payloads ?? {})).toEqual(Object.values(EVENTS));
    expect(careerHref("LL-0417")).toBe("/hr/p/LL-0417/career");
    const [kasun] = await db.q(sql`select id from hr.person where employee_no = 'LL-0417'`);
    const tags = await db.tx((tx) => technologiesOf(tx, kasun.id as string));
    expect([tags.length, tags.filter((t) => t.status === "proposed").map((t) => t.name)]).toEqual([13, ["AWS", "PostgreSQL"]]);
    await db.call("maya", "tag_technology", { personId: "LL-0417", project: "Fleet Tracker", technology: "aws" });
    const [e] = await db.q(sql`select payload from core.event where name = ${EVENTS.technologyTagged}`);
    expect(e.payload as TechnologyTagged).toMatchObject({ personId: kasun.id, project: "FLT", technology: "AWS", added: false });
  }, 60_000);
});
