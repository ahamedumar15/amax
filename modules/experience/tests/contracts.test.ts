import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextFor } from "@amax/core/server";
import { READ_CONNECTORS, WRITE_CONNECTOR as WRITE_021 } from "@amax/it-access/contracts";
import manifest from "../module";
import { CHOICES, DIMENSIONS, EVENTS, FIX_KIND, groupScores, JOBS, MIN_GROUP, myExperience, PULSE_EVERY_DAYS, READ_CONNECTOR, scoreDrops, WRITE_CONNECTOR } from "../contracts";
import { sharedDb, T } from "./db";

describe("AC-8 contract shape", () => {
  it("AC8 publishes dimensions, choices, the k-anonymity floor, 021's connectors, kinds, jobs and events with declared payloads", () => {
    expect([DIMENSIONS, CHOICES, MIN_GROUP, PULSE_EVERY_DAYS]).toEqual([["department", "site", "model"], ["well", "sometimes", "a-lot"], 5, 14]);
    expect([READ_CONNECTORS.includes(READ_CONNECTOR), WRITE_CONNECTOR === WRITE_021]).toEqual([true, true]);
    expect([FIX_KIND, JOBS]).toEqual(["experience.fix", { collect: "experience.collect", remediate: "experience.remediate" }]);
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
    expect(Object.keys(manifest.events?.payloads ?? {})).toEqual(Object.values(EVENTS));
    expect(manifest).toMatchObject({ id: "experience", group: "Operations", dependsOn: ["hr", "it-access"], integratesWith: ["helpdesk", "notifications", "insights"] });
  });
});

describe.skipIf(!hasDb)("AC-8 contract reads (Postgres)", () => {
  const use = sharedDb();

  it("AC8 groupScores gives groups of 5 or more, scoreDrops each drop with its source, and myExperience only the viewer's own devices", async () => {
    const job = contextFor.job(T, "test.contracts");
    const dept = await use().tx((tx) => groupScores(tx, job, "department"));
    expect(dept.map((g) => [g.group, g.people, g.score])).toEqual([["Engineering", 112, 8.1], ["Quality", 24, 7.1], ["Delivery", 14, 7.9], ["Sales", 9, 7.4], ["People and Culture", 8, 8.3], ["Other", 17, 8]]);
    expect(dept.find((g) => g.group === "Other")?.members).toEqual(["Finance", "IT", "Leadership"]);
    expect(await use().tx((tx) => scoreDrops(tx, job))).toEqual([{ dimension: "department", group: "Quality", from: 8.3, to: 7.1, asOf: "2026-10-16",
      source: { label: "Digital experience by department", evidenceRef: "/experience?by=department" } }]);
    const kasun = await use().as("kasun");
    const mine = await use().tx((tx) => myExperience(tx, kasun));
    expect([mine.devices.length >= 1, typeof mine.score]).toEqual([true, "number"]);
    expect(Object.keys(mine)).toEqual(["score", "devices"]);
  });
});
