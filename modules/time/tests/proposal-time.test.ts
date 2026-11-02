import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextForViewer, setGrants } from "@amax/auth";
import { agentsPlatform } from "@amax/agents/module";
import { acceptSuggestion, setSuggestionKinds } from "@amax/agents/server";
import { EVENTS as DELIVERY, type CommitTime } from "@amax/delivery/contracts";
import { ctxFor } from "../server/context";
import { correctEntry } from "../server/correct";
import { logTime } from "../server/log";
import { commitDraft, commitTimeHandler } from "../suggestions";
import { installedModules } from "./installed";
import { T, timeDb } from "./db";

describe.skipIf(!hasDb)("081 time against a proposal (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); setGrants([...(await installedModules()), agentsPlatform as never]); setSuggestionKinds([commitDraft]); }, 120_000);
  afterAll(() => db?.t.drop());

  const proposalOf = async (entryId: string) => (await db.q(sql`select p.key from time.entry e left join delivery.proposal p on p.id = e.proposal_id where e.id = ${entryId}`))[0]?.key ?? null;

  it("AC1 an entry names a proposal of its own project; another project's, an unknown or a withdrawn one is refused", async () => {
    const nimal = ctxFor(await db.as("nimal"));
    const e = await logTime(nimal, { projectKey: "CON", proposalKey: "CON-014", day: "2026-10-19", hours: 2 });
    expect(e).toMatchObject({ proposalKey: "CON-014" });
    expect(await proposalOf(e.id)).toBe("CON-014");
    await expect(logTime(nimal, { projectKey: "FLT", proposalKey: "CON-014", day: "2026-10-19", hours: 1 })).rejects.toThrow(/belongs to CON, not FLT/);
    await expect(logTime(nimal, { projectKey: "CON", proposalKey: "CON-999", day: "2026-10-19", hours: 1 })).rejects.toThrow(/no proposal CON-999/);
    await db.t.owner`update delivery.proposal set withdrawn_at = now(), withdrawn_by = 'test', withdraw_reason = 'dropped' where key = 'CON-011'`;
    await expect(logTime(nimal, { projectKey: "CON", proposalKey: "CON-011", day: "2026-10-19", hours: 1 })).rejects.toThrow(/withdrawn/);
  });

  it("AC2 accepting a commit's hours logs them on the commit's proposal", async () => {
    const nimal = await db.as("nimal");
    const [con] = await db.q(sql`select id from delivery.project where key = 'CON'`);
    const c: CommitTime = { userId: nimal.userId, projectId: con.id as string, projectKey: "CON", proposalKey: "CON-014", day: "2026-10-20", hours: 1.5, commit: "c0ffee081" };
    await withTenant(db.app, T, (tx) => commitTimeHandler.handle({ tx, tenantId: T, event: { id: "ev-081", name: DELIVERY.commitTime, payload: c } }));
    const [s] = await db.q(sql`select id from agents.suggestion where kind = 'time.commit-draft' and proposed->>'commit' = 'c0ffee081'`);
    await acceptSuggestion(contextForViewer(nimal, "chat"), { id: s.id as string });
    const [entry] = await db.q(sql`select id from time.entry where source_ref = 'git:c0ffee081'`);
    expect(await proposalOf(entry.id as string)).toBe("CON-014");
  });

  it("AC3 a correction keeps the proposal on the same project, clears it on a move, and sets or clears it when named", async () => {
    const nimal = ctxFor(await db.as("nimal"));
    const e = await logTime(nimal, { projectKey: "CON", proposalKey: "CON-014", day: "2026-10-21", hours: 3 });
    await correctEntry(nimal, { entryId: e.id, hours: 2.5 });
    expect(await proposalOf(e.id)).toBe("CON-014");
    await correctEntry(nimal, { entryId: e.id, proposalKey: null });
    expect(await proposalOf(e.id)).toBeNull();
    await correctEntry(nimal, { entryId: e.id, proposalKey: "CON-012" });
    expect(await proposalOf(e.id)).toBe("CON-012");
    await correctEntry(nimal, { entryId: e.id, projectKey: "FLT" });
    expect(await proposalOf(e.id)).toBeNull();
  });
});
