import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import manifest from "../module";
import { checklistsOf, EVENTS, EXIT_LINK_DAYS, EXIT_QUESTIONS, KINDS, openChecklists, OWNERS, type ChecklistStarted } from "../contracts";
import { onboardingDb } from "./db";

describe("AC-4 contract shape", () => {
  it("publishes kinds, owners, the exit link's life and questions, and the events the manifest emits with declared payloads", () => {
    expect([KINDS, OWNERS, EXIT_LINK_DAYS, EXIT_QUESTIONS.length]).toEqual([["joiner", "leaver"], ["HR", "ITAdmin", "Manager"], 14, 4]);
    expect(manifest.events?.emits).toEqual(Object.values(EVENTS));
    expect(Object.keys(manifest.events?.payloads ?? {})).toEqual(Object.values(EVENTS));
    expect(manifest.events?.payloads?.[EVENTS.accessRequested]).toEqual({ personId: "plain", userId: "plain", kind: "plain", legalEntityId: "plain" });
    expect(manifest).toMatchObject({ id: "onboarding", group: "People", dependsOn: ["hr"], integratesWith: ["it-access"] });
  });
});

describe.skipIf(!hasDb)("AC-4 contract reads and event payloads (Postgres)", () => {
  let db: Awaited<ReturnType<typeof onboardingDb>>;
  beforeAll(async () => { db = await onboardingDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("reads a person's checklists and the open ones, and a start emits the published payload", async () => {
    const open = await db.tx((tx) => openChecklists(tx, "joiner"));
    expect(open.map((c) => [c.kind, c.startsOn])).toEqual([["joiner", "2026-11-02"], ["joiner", "2026-11-02"]]);
    const [rifkhan] = await db.q(sql`select person_id from onboarding.checklist where person_name = 'Mohamed Rifkhan'`);
    expect((await db.tx((tx) => checklistsOf(tx, rifkhan.person_id as string))).map((c) => [c.kind, c.done])).toEqual([["joiner", 1]]);
    await db.registry.call(await db.as("maya", "HR"), "start_checklist", { employeeNo: "LL-0233", kind: "joiner" }, { source: "mcp" });
    const [e] = await db.q(sql`select payload from core.event where name = ${EVENTS.checklistStarted}`);
    expect(e.payload as ChecklistStarted).toMatchObject({ kind: "joiner", startsOn: "2020-06-01", by: expect.stringMatching(/./) });
  });
});
