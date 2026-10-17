import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { contains } from "../src/match";
import type { Json } from "../src/types";

const cases: [Json, Json][] = [
  [{ id: "s1", accepted: true }, { id: "s1" }],
  [{ id: "s1" }, { id: "s2" }],
  [{ id: 1 }, { id: 1.0 }],
  [{ id: 1 }, { id: "1" }],
  [{ a: { b: 1, c: 2 } }, { a: { b: 1 } }],
  [{ a: [1, 2, 3] }, { a: [3, 1] }],
  [{ a: [1, 2] }, { a: 1 }],
  [{ a: [{ x: 1, y: 2 }] }, { a: [{ x: 1 }] }],
  [{ a: null }, { a: null }],
  [{}, { a: null }],
  [{ a: { b: 1 } }, { a: [] }],
  [{ a: [] }, { a: {} }],
  [{ a: "x" }, {}],
];

describe.skipIf(!hasDb)("AC-3 one matching rule on both engines", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  beforeAll(async () => void (t = await migratedDatabase()), 60_000);
  afterAll(async () => void (await t?.drop()));

  it("the Temporal matcher agrees with Postgres jsonb @> on every case", async () => {
    for (const [value, match] of cases) {
      const [{ ok }] = await t.owner`select ${JSON.stringify(value)}::text::jsonb @> ${JSON.stringify(match)}::text::jsonb as ok`;
      expect([value, match, contains(value, match)]).toEqual([value, match, ok]);
    }
  });
});
