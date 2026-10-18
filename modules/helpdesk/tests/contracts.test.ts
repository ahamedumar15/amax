import { describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import manifest from "../module";
import { ACCESS_KIND, CATEGORIES, CHANNELS, EVENTS, PRIORITIES, QUEUES, queueCounts, STATUSES, SUPPORT_AGENT, TRIAGE_JOB, TRIAGE_KIND } from "../contracts";
import { sharedDb } from "./db";

describe("AC-4 contract shape", () => {
  it("AC4 publishes queues, priorities, channels, kinds and events with declared id-only payloads", () => {
    expect([QUEUES, PRIORITIES, CHANNELS, STATUSES]).toEqual([["it", "hr", "facilities"], ["low", "normal", "high", "urgent"], ["chat", "teams", "email"], ["open", "waiting", "resolved", "closed"]]);
    expect(CATEGORIES).toContain("HR letters");
    expect([TRIAGE_KIND, ACCESS_KIND, SUPPORT_AGENT, TRIAGE_JOB]).toEqual(["helpdesk.triage", "helpdesk.access", "agent:helpdesk.support", "helpdesk.triage"]);
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
    expect(Object.keys(manifest.events?.payloads ?? {})).toEqual(Object.values(EVENTS));
    expect(Object.values(manifest.events?.payloads ?? {}).flatMap((p) => Object.keys(p))).toEqual(["ticketId", "queue", "channel", "ticketId", "queue", "byAgent", "ticketId", "resourceId", "approvedBy"]);
    expect(manifest).toMatchObject({ id: "helpdesk", group: "Operations", dependsOn: [], integratesWith: ["onboarding", "hr"] });
  });
});

describe.skipIf(!hasDb)("AC-4 contract reads (Postgres)", () => {
  const use = sharedDb();

  it("AC4 queueCounts gives open and waiting counts per queue, never a ticket", async () => {
    expect(await use().tx((tx) => queueCounts(tx))).toEqual([{ queue: "it", open: 20, waiting: 7 }, { queue: "hr", open: 7, waiting: 2 }, { queue: "facilities", open: 0, waiting: 0 }]);
  });
});
