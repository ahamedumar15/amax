import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import manifest from "../module";
import { certificationsOf, COMPLETION_TARGET, EVENTS, expiringCertifications, listProgrammeRefs, numberOf, statusOn, type CertificationRecorded } from "../contracts";
import { ctxFor } from "../server/context";
import { recordCertification } from "../server/certifications";
import { learningDb } from "./db";

describe("AC-3 contract shape", () => {
  it("publishes numbers, statuses, the target and the events the manifest emits", () => {
    expect(numberOf(7)).toBe("LP-0007");
    expect([statusOn({ startsOn: "2026-11-01", endsOn: null }, "2026-10-16"), statusOn({ startsOn: "2026-01-01", endsOn: "2026-03-31" }, "2026-10-16"), statusOn({ startsOn: "2026-06-01", endsOn: "2026-11-20" }, "2026-10-16")])
      .toEqual(["planned", "done", "running"]);
    expect(COMPLETION_TARGET).toBe(80);
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
    expect(Object.keys(manifest.events?.payloads ?? {})).toEqual(Object.values(EVENTS));
  });
});

describe.skipIf(!hasDb)("AC-3 contract reads and event payloads (Postgres)", () => {
  let db: Awaited<ReturnType<typeof learningDb>>;
  beforeAll(async () => { db = await learningDb(); }, 240_000);
  afterAll(() => db?.t.drop());

  it("reads programmes and certifications, and recording one emits the published payload", async () => {
    const refs = await db.tx((tx) => listProgrammeRefs(tx));
    expect(refs).toHaveLength(18);
    expect(refs[2]).toMatchObject({ number: "LP-0003", title: "ISO 27001 awareness", mandatory: true });
    const soon = await db.tx((tx) => expiringCertifications(tx, "2026-10-16", "2026-12-31"));
    expect(soon.map((c) => [c.name, c.expiresOn])).toEqual([
      ["AZ-305 Solutions Architect", "2026-12-02"], ["ISTQB Advanced", "2026-12-18"], ["AZ-104 Azure Administrator", "2026-12-21"],
      ["Certified Kubernetes Application Developer", "2026-12-23"], ["AWS Developer Associate", "2026-12-28"], ["Fabric Analytics Engineer (DP-600)", "2026-12-30"],
    ]);
    expect((await db.tx((tx) => certificationsOf(tx, soon[0].personId))).map((c) => c.name)).toContain("AZ-305 Solutions Architect");
    await recordCertification(ctxFor(await db.as("maya", "HR")), { employeeNo: "LL-0417", name: "AZ-204 Developer", issuer: "Microsoft", issuedOn: "2026-10-01", expiresOn: "2027-10-01" });
    const [e] = await db.q(sql`select payload from core.event where name = ${EVENTS.certificationRecorded} order by created_at desc limit 1`);
    expect(e.payload as CertificationRecorded).toMatchObject({ name: "AZ-204 Developer", expiresOn: "2027-10-01" });
  });
});
