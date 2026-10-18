import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import manifest from "../module";
import { accessOf, ACTIONS, EVENTS, READ_CONNECTORS, reviewStatus, WRITE_CONNECTOR, WRITE_SCOPES } from "../contracts";
import { sharedDb, T } from "./db";

describe("AC-4 contract shape", () => {
  it("publishes the actions, connectors, scopes and the events the manifest emits, each with a declared payload and no money or names", () => {
    expect(ACTIONS).toEqual(["grant", "revoke", "remove-seat"]);
    expect([...READ_CONNECTORS, WRITE_CONNECTOR]).toEqual(["msgraph-read", "azure-devops", "github", "msgraph-write"]);
    expect(WRITE_SCOPES).toContain("LicenseAssignment.ReadWrite.All");
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
    expect(Object.keys(manifest.events?.payloads ?? {})).toEqual(Object.values(EVENTS));
    expect(Object.values(manifest.events?.payloads ?? {}).flatMap((p) => Object.keys(p)).filter((k) => /usd|name/i.test(k))).toEqual([]);
    expect(manifest).toMatchObject({ id: "it-access", group: "Operations", dependsOn: ["hr"], integratesWith: ["onboarding"] });
  });
});

describe.skipIf(!hasDb)("AC-4 contract reads (Postgres)", () => {
  const use = sharedDb();

  it("reads a person's access and the review status for a job and IT Admin, never money, and nothing for someone without it-access", async () => {
    const db = use();
    const [kasun] = await db.q(sql`select id from hr.person where name = 'Kasun Dias'`);
    const job = contextFor.job(T, "test");
    expect(await db.tx((tx) => accessOf(tx, job, kasun.id as string))).toMatchObject({ entraGroups: 3, licences: 4, devices: 1, adminRoles: [], reviewedOn: "2026-07-15", status: "active" });
    const ravi = await db.as("ravi");
    expect(await db.tx((tx) => reviewStatus(tx, ravi, "2026-07-01"))).toMatchObject({ admins: 2, lastReviewOn: "2026-07-15" });
    expect(await db.tx(async (tx) => accessOf(tx, await db.as("nimal"), kasun.id as string))).toBeNull();
  }, 120_000);
});
