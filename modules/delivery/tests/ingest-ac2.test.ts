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
});
