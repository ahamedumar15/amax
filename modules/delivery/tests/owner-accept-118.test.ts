import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextForViewer, setGrants, type Viewer } from "@amax/auth";
import { agentsPlatform } from "@amax/agents/module";
import { acceptSuggestion, setSuggestionKinds } from "@amax/agents/server";
import delivery from "../module";
import { proposalAgent } from "../server/agent";
import { ctxFor } from "../server/context";
import { addProposalTask } from "../server/lifecycle";
import { proposalKinds } from "../server/proposal-kinds";
import { createProposal, moveProposal } from "../server/services";
import { markTaskDone } from "../server/tasks";
import { linkIdentity } from "../suggestions";
import { proposalDb, T } from "./proposal-db";

// 118 (117 final pass): accepting a Suggested owner follows the Unassigned chip's rule: an open proposal takes the
// owner; one released since the suggestion was made is refused with nothing changed.
describe.skipIf(!hasDb)("118 the Suggested owner's accept guard (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => {
    db = await proposalDb();
    setGrants([delivery, agentsPlatform as never]);
    setSuggestionKinds([linkIdentity, ...proposalKinds]);
    maya = await db.as("maya");
  }, 120_000);
  afterAll(() => db?.t.drop());
  let seen = 0;
  const runAgent = async () => {
    const events = await db.q(sql`select id, name, payload from core.event where name like 'delivery.%' order by created_at, id`);
    for (const e of events.slice(seen)) {
      for (const h of proposalAgent.filter((x) => x.event === e.name)) await withTenant(db.app, T, (tx) => h.handle({ tx, tenantId: T, event: { id: e.id as string, name: e.name as string, payload: e.payload as Record<string, unknown> } }));
    }
    seen = events.length;
  };

  it.each([
    ["still open", null, true],
    ["released since", "released", false],
  ])("a Suggested owner for a proposal %s is %s", async (_n, phase, accepted) => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: `Accept guard ${String(phase)}` });
    await addProposalTask(ctxFor(maya), { key, title: "Step 1" });
    for (const to of ["planned", "building"] as const) await moveProposal(ctxFor(maya), { key, to });
    await db.t.owner`update delivery.proposal set owner_user_id = null, owner_name = null where key = ${key}`;
    await markTaskDone(ctxFor(maya), { key, task: "T1" });
    await runAgent();
    const [s] = await db.q(sql`select s.id from agents.suggestion s join delivery.proposal p on p.id::text = s.target_id where p.key = ${key} and s.kind = 'delivery.proposal-owner'`);
    if (phase) await db.t.owner`update delivery.proposal set phase = ${phase} where key = ${key}`;
    const result = await acceptSuggestion(contextForViewer(maya, "chat"), { id: s.id as string }).then(() => "accepted", (e: Error) => e.message);
    expect(result).toEqual(accepted ? "accepted" : expect.stringMatching(/is released now and needs no owner; nothing was changed/));
    expect(((await db.row(key)).owner_user_id as string | null) !== null).toBe(accepted);
  });
});
