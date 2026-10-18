import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import manifest from "../module";
import { CANDIDATE_FIELDS, EVENTS, listOpenRoles, registerSignProvider, signProviders, STAGE_LABELS, STAGES } from "../contracts";
import { sharedDb, T } from "./db";

describe("AC-4 contract shape", () => {
  it("publishes the stages, candidate fields, sign providers and the events the manifest emits, each with a declared payload and no candidate data", () => {
    expect(STAGES).toEqual(["applied", "screening", "interview", "offer", "hired"]);
    expect(Object.keys(STAGE_LABELS)).toEqual([...STAGES]);
    expect(Object.values(CANDIDATE_FIELDS).every((c) => c === "candidate")).toBe(true);
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
    expect(Object.keys(manifest.events?.payloads ?? {})).toEqual(Object.values(EVENTS));
    expect(Object.values(manifest.events?.payloads ?? {}).flatMap((p) => Object.keys(p))).not.toEqual(expect.arrayContaining(["name"]));
    registerSignProvider({ id: "test-sign", label: "Test (fictional)", fictional: true, send: async () => "x", status: async () => "sent" });
    expect(signProviders().map((p) => p.id)).toEqual(["zoho-sign", "demo", "test-sign"]);
    expect(manifest).toMatchObject({ id: "recruitment", group: "People", dependsOn: ["hr"] });
  });
});

describe.skipIf(!hasDb)("AC-4 contract reads (Postgres)", () => {
  const use = sharedDb();

  it("lists open roles for a job and for Leadership, never a candidate, and none for someone without recruitment", async () => {
    const db = use();
    const roles = await db.tx((tx) => listOpenRoles(tx, contextFor.job(T, "test")));
    expect(roles.map((r) => [r.title, r.openings, r.raisedByAgent])).toEqual([["AI engineer", 1, false], ["QA engineer", 1, false], ["Senior .NET engineer", 2, true]]);
    expect(await db.tx(async (tx) => listOpenRoles(tx, await db.as("maya", "Leadership")))).toEqual(roles);
    expect(await db.tx(async (tx) => listOpenRoles(tx, await db.as("nimal")))).toEqual([]);
  }, 60_000);
});
