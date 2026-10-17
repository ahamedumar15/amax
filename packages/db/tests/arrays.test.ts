import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { textArray } from "../src/tenant";
import { freshDatabase, hasDb } from "../src/testdb";
import { createDb } from "../src/client";

describe.skipIf(!hasDb)("arrays are one bound parameter (review round 1)", () => {
  let t: Awaited<ReturnType<typeof freshDatabase>>;
  let db: ReturnType<typeof createDb>["db"];
  beforeAll(async () => { t = await freshDatabase(); db = createDb(t.url, { max: 1 }).db; });
  afterAll(() => t?.drop());
  it.each([
    [["plain", "two words"]],
    [['quote " inside', "back\\slash", "comma, here", "{brace}"]],
    [[]],
  ])("%j round-trips exactly, and works in any()", async (xs) => {
    const [r] = await db.execute(sql`select ${textArray(xs)} as a, 'comma, here' = any(${textArray(xs)}) as hit`);
    expect(r.a).toEqual(xs);
    expect(r.hit).toBe(xs.includes("comma, here"));
  });
});
