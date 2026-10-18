import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime, type ServiceContext } from "@amax/core/server";
import { authenticateToken, createPrincipal, installAuthorizer, principalContext, setGrants, upsertPasswordUser, viewerForUser } from "@amax/auth";
import manifest from "../module";
import { listActivity } from "../server/activity";
import { syncProposal } from "../server/services";
import { markTaskDone } from "../server/tasks";

const T = "abababab-0000-4000-8000-000000000008";

describe.skipIf(!hasDb)("008 AC-1 sync_proposal and mark_task_done as a service credential acting for a person", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let ci: ServiceContext;
  let ops: Awaited<ReturnType<typeof viewerForUser>>;

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([manifest]);
    installAuthorizer();
    await t.owner`insert into core.tenant (id, name) values (${T}, 'amax')`;
    const admin = await upsertPasswordUser(app, T, { email: "ops@amax.test", name: "Ops Admin", roles: ["Admin"], password: "ops-password-123" });
    const dev = await upsertPasswordUser(app, T, { email: "nimal@amax.test", name: "Nimal Silva", roles: ["Engineer"], password: "dev-password-123" });
    ops = (await withTenant(app, T, (tx) => viewerForUser(tx, T, admin)))!;
    const { token } = await createPrincipal(app, ops, { name: "specclaw-ci", scopes: ["delivery:proposal:sync", "delivery:task:done"], actsFor: [dev], days: 30 });
    const id = await authenticateToken(app, token);
    if (id?.kind !== "principal") throw new Error("no principal");
    ci = { ...(await principalContext(app, id.principal, "delivery:task:done")), onBehalfOf: `user:${dev}` };
  });
  afterAll(() => t?.drop());

  const tasks = async (key: string) => withTenant(app, T, (tx) => tx.execute(sql`select t.ref, t.done from delivery.task t join delivery.proposal p on p.id = t.proposal_id where p.key = ${key} order by t.ref`));
  const counts = async (key: string) => (await withTenant(app, T, (tx) => tx.execute(sql`select tasks_done, tasks_total from delivery.proposal where key = ${key}`)))[0];

  it("syncs tasks by id, closes one from a commit, keeps it closed on the next sync, and feeds the Overview", async () => {
    const sync = (done: boolean[]) => syncProposal(ci, { projectKey: "ING", project: { name: "Ingest", client: "x" }, key: "ING-001", title: "Invoice export", phase: "building",
      tasksDone: 0, tasksTotal: 0, source: "specclaw", sourceRef: "001-invoice-export", releasedAt: null, meta: {}, tasks: done.map((d, i) => ({ ref: `T${i + 1}`, title: `step ${i + 1}`, done: d })) });
    await sync([true, false, false]);
    expect(await counts("ING-001")).toEqual({ tasks_done: 1, tasks_total: 3 });
    expect(await markTaskDone(ci, { key: "ING-001", task: "T3", commit: "a91f3c2e" })).toMatchObject({ done: true, tasksDone: 2, tasksTotal: 3 });
    await sync([true, false, false]);
    expect((await tasks("ING-001")).map((r) => r.done)).toEqual([true, false, true]);
    expect(await counts("ING-001")).toEqual({ tasks_done: 2, tasks_total: 3 });
    expect(await markTaskDone(ci, { key: "ING-001", task: "T3" })).toMatchObject({ done: true });
    const [line] = await listActivity(ops!, 5);
    expect(line).toMatchObject({ by: "specclaw-ci for Nimal", agent: true, text: "finished task 3 of ING-001 Invoice export", detail: "From commit a91f3c2" });
    const [audit] = await withTenant(app, T, (tx) => tx.execute(sql`select actor, on_behalf_of from core.audit_event where action = 'delivery.task.done' order by seq desc limit 1`));
    expect(audit).toMatchObject({ on_behalf_of: expect.stringContaining("user:") });
    await expect(markTaskDone(ci, { key: "ING-001", task: "T9" })).rejects.toThrow(/has no task T9/);
  });
});
