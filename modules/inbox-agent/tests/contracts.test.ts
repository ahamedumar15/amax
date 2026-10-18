import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import manifest from "../module";
import { EVENTS, inboxState, RECORD_TYPES, SCAN_JOB, SOURCE_KINDS, SUGGESTION_KIND } from "../contracts";
import { ROUTES } from "../routes";
import { sharedDb } from "./db";

describe("AC-4 contract shape", () => {
  it("AC4 publishes record types, events with declared id-and-count payloads, the job and the suggestion kind", () => {
    expect([RECORD_TYPES, SOURCE_KINDS, SCAN_JOB, SUGGESTION_KIND]).toEqual([["opportunity", "activity", "leave", "ticket"], ["mailbox", "channel"], "inbox-agent.scan", "inbox-agent.route"]);
    expect(Object.keys(ROUTES)).toEqual([...RECORD_TYPES]);
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
    expect(Object.keys(manifest.events?.payloads ?? {})).toEqual(Object.values(EVENTS));
    expect(Object.values(manifest.events?.payloads ?? {}).flatMap((p) => Object.keys(p))).toEqual(["scanId", "status", "messages", "findId", "recordType"]);
    expect(manifest).toMatchObject({ id: "inbox-agent", group: "Operations", dependsOn: [], integratesWith: ["presales", "leave", "helpdesk"] });
  });
});

describe.skipIf(!hasDb)("AC-4 contract reads (Postgres)", () => {
  const use = sharedDb(true);

  it("AC4 inboxState gives counts only: consent, the allow-list, open finds and the last scan", async () => {
    expect(await use().tx((tx) => inboxState(tx))).toEqual({ consented: true, mailboxes: 6, channels: 4, openFinds: 3, lastScanAt: expect.any(String), lastStatus: "completed" });
  });
});
