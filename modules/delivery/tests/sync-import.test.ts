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
    const before = Number((await withTenant(app, T, (tx) => tx.execute(sql`select count(*)::int as n from core.audit_event`)))[0].n);
    const r = await syncSpecclaw(app, ctx, { projectKey: "AMX", projectName: "amax", client: "Internal", records: readSpecclaw(repoRoot), sha: "def456" });
    expect(r).toMatchObject({ created: 0, updated: 0, withdrawn: 0 });
    expect(Number((await withTenant(app, T, (tx) => tx.execute(sql`select count(*)::int as n from core.audit_event`)))[0].n)).toBe(before);
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

  it("in a synced project, hand-made proposals get their own series, so every spec change still syncs (review rounds 4 and 5)", async () => {
    const repo = fakeRepo({ "001-a": { status: "✅ Approved" } });
    await syncSpecclaw(app, ctx, { projectKey: "RB", projectName: "rb", client: "x", records: readSpecclaw(repo), sha: "1" });
    const { createProposal } = await import("../server/services");
    const { ctxFor } = await import("../server/context");
    expect((await createProposal(ctxFor(ops!), { projectKey: "RB", title: "Made by hand" })).key).toBe("RB-H001");
    expect((await createProposal(ctxFor(ops!), { projectKey: "RB", title: "Also by hand" })).key).toBe("RB-H002");
    const repo2 = fakeRepo({ "001-a": { status: "✅ Approved" }, "002-b": {} });
    const r = await syncSpecclaw(app, ctx, { projectKey: "RB", projectName: "rb", client: "x", records: readSpecclaw(repo2), sha: "2" });
    expect(r).toMatchObject({ created: 1, skipped: [] });
  });

  it("a proposal made by hand before the first sync moves to the hand series; both it and the spec change end up present (review round 5)", async () => {
    await t.owner`insert into delivery.project (tenant_id, key, name, client, billing, color) values (${T}, 'LG', 'legacy', 'x', 'internal', 'mint')`;
    const { createProposal } = await import("../server/services");
    const { ctxFor } = await import("../server/context");
    const made = await createProposal(ctxFor(ops!), { projectKey: "LG", title: "Made by hand" });
    expect(made.key).toBe("LG-001");
    const repo = fakeRepo({ "001-a": { status: "✅ Approved" }, "002-b": {} });
    const r = await syncSpecclaw(app, ctx, { projectKey: "LG", projectName: "lg", client: "x", records: readSpecclaw(repo), sha: "1" });
    expect(r).toMatchObject({ skipped: [] });
    const rows = await withTenant(app, T, (tx) => tx.execute(sql`select id, key, title, source from delivery.proposal p where key like 'LG-%' order by key`));
    expect(rows.find((x) => x.id === made.id)).toMatchObject({ key: "LG-H001", title: "Made by hand", source: null });
    expect(rows.filter((x) => x.source === "specclaw").map((x) => x.key).sort()).toEqual(readSpecclaw(repo).map((x) => `LG-${x.number}`).sort());
    const [audit] = await withTenant(app, T, (tx) => tx.execute(sql`select after->'rekeyed' as rekeyed from core.audit_event where action = 'delivery.proposal.sync' and after ? 'rekeyed' order by seq desc limit 1`));
    expect(audit.rekeyed).toEqual({ from: "LG-001", to: "LG-H001" });
    expect((await createProposal(ctxFor(ops!), { projectKey: "LG", title: "Next by hand" })).key).toBe("LG-H002");
    const again = await syncSpecclaw(app, ctx, { projectKey: "LG", projectName: "lg", client: "x", records: readSpecclaw(repo), sha: "2" });
    expect(again).toMatchObject({ created: 0, updated: 0 });
  });

  it.each([
    ["legacy numeric key in an already-synced project", { synced: true, phase: "planned", source: null }, "rekeyed"],
    ["made before the first sync", { synced: false, phase: "proposed", source: null }, "rekeyed"],
    ["released by hand: shipped history keeps its key", { synced: false, phase: "released", source: null }, "skipped"],
    ["from another source", { synced: false, phase: "planned", source: "jira" }, "skipped"],
  ])("a proposal on a spec key, %s (review rounds 5 and 6)", async (_n, c, expected) => {
    const P = `K${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    await t.owner`insert into delivery.project (tenant_id, key, name, client, billing, color) values (${T}, ${P}, 'p', 'x', 'internal', 'mint')`;
    if (c.synced) await syncSpecclaw(app, ctx, { projectKey: P, projectName: "p", client: "x", records: readSpecclaw(fakeRepo({ "001-a": {} })), sha: "1" });
    const [{ id }] = await t.owner`insert into delivery.proposal (tenant_id, project_id, key, title, phase, source)
      select ${T}, id, ${`${P}-002`}, 'Made by hand', ${c.phase}, ${c.source} from delivery.project where key = ${P} returning id`;
    const repo = fakeRepo({ "001-a": {}, "002-b": {}, "1001-big": {} });
    const r = await syncSpecclaw(app, ctx, { projectKey: P, projectName: "p", client: "x", records: readSpecclaw(repo), sha: "2" });
    const [hand] = await t.owner`select key from delivery.proposal where id = ${id}`;
    const spec = (await t.owner`select p.key from delivery.proposal p join delivery.project pr on pr.id = p.project_id where pr.key = ${P} and p.source = 'specclaw' order by p.key`).map((x) => x.key);
    if (expected === "rekeyed") {
      expect(hand.key).toBe(`${P}-H001`);
      expect(spec).toEqual([`${P}-001`, `${P}-002`, `${P}-1001`]);
      expect(r.skipped).toEqual([]);
      const [audit] = await t.owner`select before, after from core.audit_event where action = 'delivery.proposal.rekey' and resource_id = ${id}`;
      expect(audit).toMatchObject({ before: { key: `${P}-002` }, after: { key: `${P}-H001` } });
      const [ev] = await t.owner`select payload from core.event where name = 'delivery.proposal.rekeyed' and payload->>'proposalId' = ${id}`;
      expect(ev.payload).toMatchObject({ from: `${P}-002`, to: `${P}-H001` });
    } else {
      expect(hand.key).toBe(`${P}-002`);
      expect(spec).toEqual([`${P}-001`, `${P}-1001`]);
      expect(r.skipped).toEqual([expect.stringMatching(new RegExp(`^${P}-002: .*can't be moved`))]);
    }
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

  it("a corrupt state.json on an overlay branch is reported too, not hidden behind main's phase (review round 2)", async () => {
    const main = fakeRepo({ "001-a": { status: "✅ Approved" } });
    const branch = fakeRepo({ "001-a": { status: "✅ Approved" } });
    writeFileSync(join(branch, ".specclaw/changes/001-a/state.json"), "{ not json");
    const records = readSpecclaw({ dir: main, ref: "main@aaaaaaaa" }, [{ dir: branch, ref: "specclaw/001-a@bbbbbbbb" }]);
    expect(records[0]).toMatchObject({ unreadable: true, source: "specclaw/001-a@bbbbbbbb" });
    const r = await syncSpecclaw(app, ctx, { projectKey: "CO", projectName: "co", client: "x", records, sha: "aaaaaaaa" });
    expect(r.skipped[0]).toMatch(/state.json unreadable at specclaw\/001-a@bbbbbbbb/);
  });

  it("a re-sync at a new commit with no spec change writes nothing (review round 2)", async () => {
    const repo = fakeRepo({ "001-a": { status: "✅ Approved" }, "002-b": {} });
    const first = await syncSpecclaw(app, ctx, { projectKey: "NC", projectName: "nc", client: "x", records: readSpecclaw({ dir: repo, ref: "main@1111111a" }), sha: "1111111a" });
    expect(first.created).toBe(2);
    const before = Number((await withTenant(app, T, (tx) => tx.execute(sql`select count(*)::int as n from core.audit_event where action = 'delivery.proposal.sync'`)))[0].n);
    const again = await syncSpecclaw(app, ctx, { projectKey: "NC", projectName: "nc", client: "x", records: readSpecclaw({ dir: repo, ref: "main@2222222b" }), sha: "2222222b" });
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 2 });
    expect(Number((await withTenant(app, T, (tx) => tx.execute(sql`select count(*)::int as n from core.audit_event where action = 'delivery.proposal.sync'`)))[0].n)).toBe(before);
  });

  it("main's state.json unreadable but a readable overlay: still skipped and reported at main (review round 3)", async () => {
    const main = fakeRepo({ "001-a": { status: "✅ Approved" } });
    writeFileSync(join(main, ".specclaw/changes/001-a/state.json"), "{ not json");
    const branch = fakeRepo({ "001-a": { status: "✅ Approved", claim: true } });
    const records = readSpecclaw({ dir: main, ref: "main@cccccccc" }, [{ dir: branch, ref: "specclaw/001-a@dddddddd" }]);
    expect(records[0]).toMatchObject({ unreadable: true, source: "main@cccccccc" });
  });

  it("a sync and hand-made creates racing in one project: distinct keys, nothing lost (review rounds 3 and 4)", async () => {
    const { createProposal } = await import("../server/services");
    const { ctxFor } = await import("../server/context");
    const repo = fakeRepo(Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`00${i + 1}-c${i}`, { status: "✅ Approved" }])));
    await syncSpecclaw(app, ctx, { projectKey: "RC", projectName: "rc", client: "x", records: readSpecclaw(repo).slice(0, 1), sha: "1" });
    const [sync, ...made] = await Promise.all([
      syncSpecclaw(app, ctx, { projectKey: "RC", projectName: "rc", client: "x", records: readSpecclaw(repo), sha: "2" }),
      ...Array.from({ length: 4 }, (_, i) => createProposal(ctxFor(ops!), { projectKey: "RC", title: `By hand ${i}` })),
    ]) as [Awaited<ReturnType<typeof syncSpecclaw>>, ...{ key: string }[]];
    const rows = await withTenant(app, T, (tx) => tx.execute(sql`select p.key, p.source, p.title from delivery.proposal p join delivery.project pr on pr.id = p.project_id where pr.key = 'RC' order by p.key`));
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    for (const m of made) expect(rows.find((r) => r.key === m.key)?.source).toBeNull();
    expect(rows.filter((r) => r.source === "specclaw")).toHaveLength(6);
    expect(sync.skipped).toEqual([]);
  });

  it("a sync waits for the project lock a hand-made create holds (review round 3)", async () => {
    const repo = fakeRepo({ "001-a": { status: "✅ Approved" }, "002-b": { status: "✅ Approved" } });
    await syncSpecclaw(app, ctx, { projectKey: "LK", projectName: "lk", client: "x", records: readSpecclaw(repo).slice(0, 1), sha: "1" });
    let done = false;
    await t.owner.begin(async (tx) => {
      await tx`select 1 from delivery.project where key = 'LK' for update`;
      const sync = syncSpecclaw(app, ctx, { projectKey: "LK", projectName: "lk", client: "x", records: readSpecclaw(repo), sha: "2" }).then((r) => { done = true; return r; });
      await new Promise((r) => setTimeout(r, 400));
      expect(done).toBe(false);
      void sync;
      // (Released when this transaction commits.)
    });
    await expect.poll(() => done, { timeout: 5000 }).toBe(true);
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
