import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase, repoRoot } from "@amax/db/testdb";
import { configureRuntime, type ServiceContext } from "@amax/core/server";
import { authenticateToken, createPrincipal, installAuthorizer, principalContext, setGrants, upsertPasswordUser, viewerForUser } from "@amax/auth";
import manifest from "../module";
import { EVENTS } from "../contracts";
import { getProject } from "../server/queries";
import { syncSpecclaw } from "../sync/import";
import { readSpecclaw } from "../sync/specclaw";

const T = "abababab-0000-4000-8000-0000000000ab";

function fakeRepo(changes: Record<string, { status?: string; tasks?: string; claim?: boolean; archived?: boolean }>) {
  const root = mkdtempSync(join(tmpdir(), "amax-spec-"));
  for (const [dir, c] of Object.entries(changes)) {
    const base = join(root, ".specclaw/changes", c.archived ? "archive" : "", dir);
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, "change.md"), `# ${dir} title\n\n**Change:** ${dir}\n**Lane:** Platform · **Module:** \`x\` · **Depends on:** [001](../001/change.md)\n\n## Tasks\n${c.tasks ?? ""}\n`);
    if (c.status) writeFileSync(join(base, "status.md"), `| Proposal | ${c.status} | |\n`);
    if (c.claim) writeFileSync(join(base, "claim.md"), "machine: vps\n");
  }
  return root;
}

describe.skipIf(!hasDb)("AC-2/AC-3 self-sync import", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let ctx: ServiceContext;
  const audits = async () => Number((await withTenant(app, T, (tx) => tx.execute(sql`select count(*)::int as n from core.audit_event where action = 'delivery.proposal.sync'`)))[0].n);

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([manifest]);
    installAuthorizer();
    await t.owner`insert into core.tenant (id, name) values (${T}, 'amax')`;
    const adminId = await upsertPasswordUser(app, T, { email: "ops@amax.test", name: "Ops", roles: ["Admin"], password: "ops-password-123" });
    const owner = (await withTenant(app, T, (tx) => viewerForUser(tx, T, adminId)))!;
    const { token } = await createPrincipal(app, owner, { name: "specclaw-sync", scopes: ["delivery:proposal:sync"], actsFor: [], days: 30 });
    const id = await authenticateToken(app, token);
    if (id?.kind !== "principal") throw new Error("no principal");
    ctx = await principalContext(app, id.principal, "delivery:proposal:sync");
  });
  afterAll(() => t?.drop());

  it("imports this repo's changes as project AMX, audited as the principal", async () => {
    const records = readSpecclaw(repoRoot);
    const r = await syncSpecclaw(app, ctx, { projectKey: "AMX", projectName: "amax", client: "Internal", records, sha: "abc123" });
    expect(r.created).toBe(records.length);
    const admin = (await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = 'ops@amax.test'`)))[0].id as string;
    const viewer = (await withTenant(app, T, (tx) => viewerForUser(tx, T, admin)))!;
    const board = (await getProject(viewer, "AMX"))!;
    expect(board.proposals.find((p) => p.key === "AMX-001")).toMatchObject({ phase: "released", tasksDone: 8, tasksTotal: 8, agent: "specclaw" });
    const [row] = await withTenant(app, T, (tx) => tx.execute(sql`select actor, source from core.audit_event where action = 'delivery.proposal.sync' limit 1`));
    expect(row.actor).toMatch(/^sp:/);
  });

  it("re-running with nothing changed writes and audits nothing", async () => {
    const before = await audits();
    const r = await syncSpecclaw(app, ctx, { projectKey: "AMX", projectName: "amax", client: "Internal", records: readSpecclaw(repoRoot), sha: "def456" });
    expect(r).toMatchObject({ created: 0, updated: 0, withdrawn: 0 });
    expect(await audits()).toBe(before);
  });

  it("a branch overlay moves a change forward and emits phase_changed; a vanished folder is withdrawn", async () => {
    const main = fakeRepo({ "001-a": { archived: true }, "002-b": { status: "✅ Approved" }, "003-c": {} });
    const branch = fakeRepo({ "002-b": { status: "✅ Approved", tasks: "- [x] `T1` — one\n- [ ] `T2` — two", claim: true } });
    await syncSpecclaw(app, ctx, { projectKey: "TST", projectName: "test", client: "x", records: readSpecclaw(main), sha: "1" });
    const moved = await syncSpecclaw(app, ctx, { projectKey: "TST", projectName: "test", client: "x", records: readSpecclaw(main, [branch]), sha: "2" });
    expect(moved.updated).toBe(1);
    const [ev] = await withTenant(app, T, (tx) => tx.execute(sql`select payload from core.event where name = ${EVENTS.proposalPhaseChanged} order by created_at desc limit 1`));
    expect(ev.payload).toMatchObject({ key: "TST-002", from: "planned", to: "building" });
    rmSync(join(main, ".specclaw/changes/003-c"), { recursive: true });
    const gone = await syncSpecclaw(app, ctx, { projectKey: "TST", projectName: "test", client: "x", records: readSpecclaw(main, [branch]), sha: "3" });
    expect(gone.withdrawn).toBe(1);
    const [w] = await withTenant(app, T, (tx) => tx.execute(sql`select meta->>'withdrawn' as w from delivery.proposal where key = 'TST-003'`));
    expect(w.w).toBe("true");
  });
});

describe.skipIf(!hasDb)("sync robustness (review round 1)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let ctx: ServiceContext;
  let ops: Awaited<ReturnType<typeof viewerForUser>>;

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    setGrants([manifest]);
    installAuthorizer();
    await t.owner`insert into core.tenant (id, name) values (${T}, 'amax')`;
    const adminId = await upsertPasswordUser(app, T, { email: "ops@amax.test", name: "Ops", roles: ["Admin"], password: "ops-password-123" });
    ops = (await withTenant(app, T, (tx) => viewerForUser(tx, T, adminId)))!;
    const { token } = await createPrincipal(app, ops, { name: "specclaw-sync", scopes: ["delivery:proposal:sync"], actsFor: [], days: 30 });
    const id = await authenticateToken(app, token);
    if (id?.kind !== "principal") throw new Error("no principal");
    ctx = await principalContext(app, id.principal, "delivery:proposal:sync");
  });
  afterAll(() => t?.drop());

  it("a hand-made proposal with a colliding key is skipped, never overwritten, and a re-run stays quiet", async () => {
    const repo = fakeRepo({ "001-a": { status: "✅ Approved" } });
    await syncSpecclaw(app, ctx, { projectKey: "RB", projectName: "rb", client: "x", records: readSpecclaw(repo), sha: "1" });
    const { createProposal } = await import("../server/services");
    const { ctxFor } = await import("../server/context");
    const made = await createProposal(ctxFor(ops!), { projectKey: "RB", title: "Made by hand" });
    expect(made.key).toBe("RB-002");
    const repo2 = fakeRepo({ "001-a": { status: "✅ Approved" }, "002-b": {} });
    const r = await syncSpecclaw(app, ctx, { projectKey: "RB", projectName: "rb", client: "x", records: readSpecclaw(repo2), sha: "2" });
    expect(r.skipped).toEqual(["RB-002: key belongs to a proposal not created by the sync"]);
    const [p] = await withTenant(app, T, (tx) => tx.execute(sql`select title, source from delivery.proposal where key = 'RB-002'`));
    expect(p).toEqual({ title: "Made by hand", source: null });
    const again = await syncSpecclaw(app, ctx, { projectKey: "RB", projectName: "rb", client: "x", records: readSpecclaw(repo2), sha: "3" });
    expect(again).toMatchObject({ created: 0, updated: 0 });
  });

  it("a corrupt state.json is reported and skipped, not read as an earlier phase", async () => {
    const repo = fakeRepo({ "001-a": { status: "✅ Approved" } });
    writeFileSync(join(repo, ".specclaw/changes/001-a/state.json"), "{ not json");
    const records = readSpecclaw({ dir: repo, ref: "main@abc12345" });
    expect(records[0]).toMatchObject({ unreadable: true, source: "main@abc12345" });
    const r = await syncSpecclaw(app, ctx, { projectKey: "CJ", projectName: "cj", client: "x", records, sha: "abc12345" });
    expect(r.created).toBe(0);
    expect(r.skipped[0]).toMatch(/state.json unreadable at main@abc12345/);
  });

  it("each record carries the branch and commit it was read from; withdrawn ones leave lists and counts", async () => {
    const main = fakeRepo({ "001-a": { status: "✅ Approved" }, "002-b": {} });
    const branch = fakeRepo({ "001-a": { status: "✅ Approved", claim: true } });
    await syncSpecclaw(app, ctx, { projectKey: "SR", projectName: "sr", client: "x", records: readSpecclaw({ dir: main, ref: "main@11111111" }, [{ dir: branch, ref: "specclaw/001-a@22222222" }]), sha: "11111111" });
    const metas = await withTenant(app, T, (tx) => tx.execute(sql`select key, meta->>'source' as source from delivery.proposal where key like 'SR-%' order by key`));
    expect(metas).toEqual([{ key: "SR-001", source: "specclaw/001-a@22222222" }, { key: "SR-002", source: "main@11111111" }]);
    rmSync(join(main, ".specclaw/changes/002-b"), { recursive: true });
    await syncSpecclaw(app, ctx, { projectKey: "SR", projectName: "sr", client: "x", records: readSpecclaw({ dir: main, ref: "main@3" }), sha: "3" });
    const { listProposals, getProject } = await import("../server/queries");
    expect((await listProposals(ops!, { projectKey: "SR" })).map((p) => p.key)).toEqual(["SR-001"]);
    expect((await getProject(ops!, "SR"))!.proposals.map((p) => p.key)).toEqual(["SR-001"]);
  });
});
