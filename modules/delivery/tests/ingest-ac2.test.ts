import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime, contextFor } from "@amax/core/server";
import { installAuthorizer, setGrants, upsertPasswordUser } from "@amax/auth";
import { linkGitIdentity } from "@amax/auth/git-identity";
import { setSuggestionKinds } from "@amax/agents/server";
import manifest from "../module";
import { closedTasks, ingestPush } from "../server/ingest";
import { syncProposal } from "../server/services";
import { linkIdentity } from "../suggestions";
import { setCommitTimeLogging } from "../server/commit-time";
import { contextForViewer, viewerForUser } from "@amax/auth";

const T = "abababab-0000-4000-8000-0000000000a2";
const push = (commits: object[]) => ingestPush({ tenantId: T, provider: "github", eventId: "e", headers: new Headers({ "x-github-event": "push" }), payload: { commits } });
const commit = (id: string, message: string, author: { username: string; email: string }, verified = false) => ({ id, message, author, timestamp: "2026-10-18T09:00:00Z", ...(verified ? { verification: { verified: true } } : {}) });

describe.skipIf(!hasDb)("008 AC-2 pushes attribute commits only through a verified Git identity", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  const done = async () => (await withTenant(app, T, (tx) => tx.execute(sql`select ref from delivery.task where done order by ref`))).map((r) => r.ref);

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([manifest]);
    installAuthorizer();
    setSuggestionKinds([linkIdentity]);
    await t.owner`insert into core.tenant (id, name) values (${T}, 'amax')`;
    const nimal = await upsertPasswordUser(app, T, { email: "nimal@amax.test", name: "Nimal Silva", roles: ["Engineer"], password: "dev-password-123" });
    await upsertPasswordUser(app, T, { email: "ayesha@amax.test", name: "Ayesha Rahman", roles: ["Engineer"], password: "dev-password-123" });
    await withTenant(app, T, (tx) => linkGitIdentity(tx, T, { provider: "github", login: "nimal-gh", email: "nimal@amax.test", userId: nimal }));
    await syncProposal(contextFor.job(T, "delivery.ingest"), { projectKey: "ING", project: { name: "Ingest", client: "x" }, key: "ING-001", title: "Invoice export", phase: "building",
      tasksDone: 0, tasksTotal: 0, source: "specclaw", sourceRef: "001", releasedAt: null, meta: {}, tasks: [1, 2, 3, 4].map((n) => ({ ref: `T${n}`, title: `step ${n}`, done: false })) });
  });
  afterAll(() => t?.drop());

  it("reads the tasks a message closes", () => expect(closedTasks("ING-001 T1 done; also con-014 t3 DONE, not CON-2 T1 done")).toEqual([{ key: "ING-001", task: "T1" }, { key: "CON-014", task: "T3" }]));

  it("a verified email or a provider-verified commit is attributed; anything else isn't, and an unknown author becomes a suggestion to link", async () => {
    await push([
      commit("a1", "ING-001 T1 done", { username: "nimal-gh", email: "nimal@amax.test" }),
      commit("a2", "ING-001 T2 done", { username: "nimal-gh", email: "someone@else.test" }),
      commit("a3", "ING-001 T3 done", { username: "ayesha-gh", email: "ayesha@amax.test" }),
      commit("a4", "ING-001 T4 done", { username: "nimal-gh", email: "laptop@else.test" }, true),
    ]);
    expect(await done()).toEqual(["T1", "T4"]);
    const [line] = await withTenant(app, T, (tx) => tx.execute(sql`select actor_id, for_user_id from delivery.activity order by at desc limit 1`));
    expect(line.actor_id).toBe("job:delivery.ingest");
    const s = await withTenant(app, T, (tx) => tx.execute(sql`select kind, title, proposed from agents.suggestion`));
    expect(s.map((r) => [r.kind, r.title])).toEqual([["delivery.git-identity", "Link ayesha-gh to Ayesha Rahman"]]);
    await push([commit("a3", "ING-001 T3 done", { username: "ayesha-gh", email: "ayesha@amax.test" })]);
    expect((await withTenant(app, T, (tx) => tx.execute(sql`select 1 from agents.suggestion`))).length).toBe(1);
  });

  it("008 AC-3, AC-6 a commit's 'Time:' hours go to the time module as a draft only once an Admin switched it on for the person's entity, after telling them", async () => {
    const [{ id: entity }] = await t.owner`insert into core.legal_entity (tenant_id, name, country, base_currency) values (${T}, 'Lumen Lanka (fictional)', 'LK', 'LKR') returning id`;
    await t.owner`update auth.user set legal_entity_id = ${entity} where email = 'nimal@amax.test'`;
    const admin = await upsertPasswordUser(app, T, { email: "ops@amax.test", name: "Ops Admin", roles: ["Admin"], password: "ops-password-123" });
    const ops = contextForViewer((await withTenant(app, T, (tx) => viewerForUser(tx, T, admin)))!, "chat");
    const drafts = async () => (await t.owner`select payload from core.event where name = 'delivery.commit.time'`).map((e) => e.payload);
    const timed = (id: string) => commit(id, "ING-001 T2 done\n\nTime: 1.5h", { username: "nimal-gh", email: "nimal@amax.test" });
    await push([timed("b1c0ffee1")]);
    expect(await drafts()).toEqual([]);
    await expect(setCommitTimeLogging(ops, { legalEntityId: entity, enabled: true })).rejects.toThrow(/tell the entity's people first/);
    await setCommitTimeLogging(ops, { legalEntityId: entity, enabled: true, peopleNotified: true });
    await push([timed("b2c0ffee2")]);
    expect(await drafts()).toEqual([expect.objectContaining({ proposalKey: "ING-001", projectKey: "ING", day: "2026-10-18", hours: 1.5, commit: "b2c0ffee2" })]);
    const [line] = await withTenant(app, T, (tx) => tx.execute(sql`select text from delivery.activity order by at desc limit 1`));
    expect(line.text).toBe("drafted 1.5 h on ING-001 for the timesheet");
  });
});
