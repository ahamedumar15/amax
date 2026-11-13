import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextForViewer, setGrants } from "@amax/auth";
import { agentsPlatform } from "@amax/agents/module";
import { installedModules } from "./installed";
import { acceptSuggestion, setSuggestionKinds } from "@amax/agents/server";
import { EVENTS as DELIVERY, type CommitTime } from "@amax/delivery/contracts";
import { commitDraft, commitTimeHandler } from "../suggestions";
import { T, timeDb } from "./db";

// 104 AC-4: a repo sync's day estimate is a suggestion on the person's own timesheet, from N commits; accepting it logs
// agent time named for the proposal in their draft week.
describe.skipIf(!hasDb)("104 AC-4 hours the repo sync estimated are a draft suggestion", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); setGrants([...(await installedModules()), agentsPlatform as never]); setSuggestionKinds([commitDraft]); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-4 says how many commits it came from; accepted, it's agent time from the repo sync on the proposal, in a draft week", async () => {
    const nimal = await db.as("nimal");
    const [con] = await db.q(sql`select id from delivery.project where key = 'CON'`);
    const c: CommitTime = { userId: nimal.userId, projectId: con.id as string, projectKey: "CON", proposalKey: "CON-014", day: "2026-10-20", hours: 1.75, commit: "CON-014/2026-10-20", commits: 6 };
    await withTenant(db.app, T, (tx) => commitTimeHandler.handle({ tx, tenantId: T, event: { id: "ev-104", name: DELIVERY.commitTime, payload: c } }));
    const [s] = await db.q(sql`select id, title, detail, agent_name from agents.suggestion where kind = 'time.commit-draft'`);
    expect(s).toMatchObject({ title: "Add 1.75 h on CON for 2026-10-20", detail: "From 6 commits on CON-014. Accept to add it to your timesheet as a draft.", agent_name: "Repo sync" });
    expect(await db.q(sql`select 1 from time.entry where user_id = ${nimal.userId} and day = '2026-10-20' and deleted_at is null`)).toEqual([]);
    await acceptSuggestion(contextForViewer(nimal, "chat"), { id: s.id as string });
    const [e] = await db.q(sql`select e.hours::float as hours, e.source, e.agent, e.note, e.source_ref, w.status, p.key from time.entry e join time.week w on w.id = e.week_id
      left join delivery.proposal p on p.id = e.proposal_id where e.user_id = ${nimal.userId} and e.day = '2026-10-20' and e.deleted_at is null`);
    expect(e).toEqual({ hours: 1.75, source: "agent", agent: "Repo sync", note: "CON-014, 6 commits", source_ref: "repo:CON-014/2026-10-20", status: "draft", key: "CON-014" });
    // The same day drafted again is already on the timesheet: no second suggestion.
    await withTenant(db.app, T, (tx) => commitTimeHandler.handle({ tx, tenantId: T, event: { id: "ev-104b", name: DELIVERY.commitTime, payload: c } }));
    expect(await db.q(sql`select 1 from agents.suggestion where kind = 'time.commit-draft'`)).toHaveLength(1);
  });
});
