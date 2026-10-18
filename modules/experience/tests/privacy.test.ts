import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import { listPeople } from "@amax/hr/contracts";
import manifest from "../module";
import { DIMENSIONS } from "../contracts";
import { sharedDb, T } from "./db";

const AU = "11111111-1111-4111-8111-1111111111a2";
type View = { all: { people: number }; groups: { label: string; people: number }[] };

describe.skipIf(!hasDb)("k-anonymity and no named person (Postgres)", () => {
  const use = sharedDb(true);
  const call = async (key: string, tool: string, args: object) => use().registry.call(await use().as(key), tool, args, { source: "mcp" });

  it("AC3 every grouping shows only groups of 5 or more, no screen or tool names a person or returns their score, and a person sees only their own", async () => {
    const people = await use().tx((tx) => listPeople(tx, contextFor.job(T, "test.privacy"), { status: ["active"] }));
    const names = people.map((p) => p.name), ids = people.flatMap((p) => [p.id, p.userId ?? p.id]);
    for (const by of DIMENSIONS) {
      const v = (await call("maya", "get_experience", { by })) as View;
      const text = JSON.stringify(v);
      expect(v.groups.every((g) => g.people >= 5), by).toBe(true);
      expect([names.filter((n) => text.includes(n)), ids.filter((id) => text.includes(id))], by).toEqual([[], []]);
    }
    await use().t.owner`update auth.role_assignment set legal_entity_ids = ${[AU]}::uuid[] where user_id = (select id from auth.user where email = 'sarah@lumenlabs.test')`;
    const sarah = (await call("sarah", "get_experience", {})) as View;
    expect(sarah.all.people).toBe(13);
    expect(sarah.groups.every((g) => g.people >= 5)).toBe(true);
    await expect(call("nimal", "get_experience", {})).rejects.toThrow();
    const own = (await call("kasun", "get_my_experience", {})) as { devices: unknown[]; score: number };
    const kasunDevices = await use().q(sqlDevices((await use().as("kasun")).userId));
    expect(own.devices).toHaveLength(kasunDevices.length);
    for (const t of manifest.mcpTools!) expect(Object.keys((t.input as unknown as { shape?: object }).shape ?? {}).filter((k) => /person|user|owner|employee/i.test(k)), t.name).toEqual([]);
  });
});

const sqlDevices = (userId: string) => sql`select id from experience.device where owner_user_id = ${userId}`;
