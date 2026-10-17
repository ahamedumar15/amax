import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { appendAudit, configureRuntime, contextFor, traceStep, withTrace } from "@amax/core/server";
import { upsertPasswordUser, viewerForUser, type Viewer } from "@amax/auth";
import { createRegistry } from "../src/registry";

const T = "00000000-0000-4000-8000-000000000a05";
const TRACE = "00000000-0000-4000-8000-0000000000f5";

describe.skipIf(!hasDb)("050 audit read tools", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let admin: Viewer, engineer: Viewer;
  const registry = createRegistry([]);
  const call = (v: Viewer, name: string, args: unknown) => registry.call(v, name, args, { source: "mcp" });

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    await t.owner`insert into core.tenant (id, name) values (${T}, 'amax')`;
    const as = async (email: string, role: "Admin" | "Engineer") => {
      const id = await upsertPasswordUser(app, T, { email, name: email, roles: [role], password: "a-long-password-1234" });
      return (await withTenant(app, T, (tx) => viewerForUser(tx, T, id)))!;
    };
    admin = await as("admin@amax.test", "Admin");
    engineer = await as("eng@amax.test", "Engineer");
    await withTrace({ traceId: TRACE, tenantId: T, actor: `user:${admin.userId}`, source: "chat" }, async () => {
      await traceStep({ kind: "turn", recordId: "c1", detail: { pins: 1 } });
      await traceStep({ kind: "pending", tool: "add_thing", args: { name: "x" } });
      await withTenant(app, T, (tx) => appendAudit(tx, contextFor.ui(T, { id: `user:${admin.userId}` }), { action: "x.create", resource: "x", resourceId: "1" }));
    });
  });
  afterAll(() => t?.drop());

  it("AC-5 Verify now, through the read tool, reports the event where a superuser's edit broke the chain", async () => {
    expect(await call(admin, "audit_status", { verify: true })).toMatchObject({ trace: { ok: true, length: 2 }, audit: { ok: true } });
    await t.owner.begin(async (tx) => {
      await tx`alter table core.trace_event disable trigger trace_append_only`;
      await tx`update core.trace_event set tool = 'delete_everything' where tenant_id = ${T} and seq = 2`;
      await tx`alter table core.trace_event enable trigger trace_append_only`;
    });
    expect(await call(admin, "audit_status", {})).toMatchObject({ trace: { ok: true } });
    expect(await call(admin, "audit_status", { verify: true })).toMatchObject({ trace: { ok: false, brokenAt: 2, reason: "hash mismatch" }, audit: { ok: true } });
  });

  it("AC-6 search_audit and get_trace are Admin-only and return the trace with its audited write", async () => {
    const steps = (await call(admin, "get_trace", { traceId: TRACE })) as { chain: string; what: string }[];
    expect(steps.map((s) => `${s.chain}:${s.what}`)).toEqual(["trace:turn", "trace:pending", "audit:x.create"]);
    expect(await call(admin, "search_audit", { chain: "audit", seq: 1 })).toEqual([expect.objectContaining({ chain: "audit", seq: 1, traceId: TRACE })]);
    expect(registry.toolsFor(engineer).map((x) => x.name)).not.toContain("search_audit");
    for (const name of ["search_audit", "get_trace", "audit_status"]) {
      await expect(call(engineer, name, name === "get_trace" ? { traceId: TRACE } : {})).rejects.toMatchObject({ code: "forbidden" });
    }
  });
});
