import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { hasDb, migratedDatabase, withTenant, type Db } from "@amax/db";
import { configureRuntime, contextFor, defineService, ForbiddenError, setAuthorizer, ValidationError, type ServiceContext } from "../src/server";

const T = "00000000-0000-4000-8000-0000000000c3";
const KEY = "test-audit-key-test-audit-key-123456";

// A sample service: rename a legal entity, with a classified field to show redaction.
const renameEntity = defineService({
  name: "core.legal_entity.rename",
  action: "core:legal_entity:update",
  resource: "core.legal_entity",
  input: z.object({ id: z.uuid(), name: z.string().min(1), bankAccount: z.string().optional() }),
  sensitive: { bankAccount: "bank" },
  async run(tx, input) {
    const [before] = await tx.execute(sql`select name from core.legal_entity where id = ${input.id}`);
    await tx.execute(sql`update core.legal_entity set name = ${input.name} where id = ${input.id}`);
    return {
      result: { id: input.id },
      resourceId: input.id,
      before: { name: before.name, bankAccount: "LK00-OLD" },
      after: { name: input.name, bankAccount: input.bankAccount ?? null },
      events: [{ name: "core.legal_entity.renamed", payload: { id: input.id, name: input.name } }],
    };
  },
});

describe.skipIf(!hasDb)("AC-3 defineService pipeline", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let entityId: string;

  beforeAll(async () => {
    t = await migratedDatabase();
    await t.owner`insert into core.tenant (id, name) values (${T}, 'Lumen Labs')`;
    [{ id: entityId }] = await t.owner`insert into core.legal_entity (tenant_id, name, country, base_currency) values (${T}, 'Lumen Labs Lanka', 'LK', 'LKR') returning id`;
    app = t.app();
    configureRuntime({ db: app, auditKey: KEY });
    setAuthorizer(() => true);
  });
  afterAll(() => t?.drop());

  const audits = () => withTenant(app, T, (tx) => tx.execute(sql`select * from core.audit_event order by seq`));

  it("a server action, an MCP call and a job produce the same audit shape", async () => {
    const paths: ServiceContext[] = [
      contextFor.ui(T, { id: "user:maya", roles: ["Admin"] }),
      contextFor.mcp(T, { id: "sp:specclaw", kind: "service" }, "user:maya"),
      contextFor.job(T, "nightly-sync", "user:maya"),
    ];
    for (const [i, ctx] of paths.entries()) await renameEntity(ctx, { id: entityId, name: `Lumen ${i}`, bankAccount: "LK12-3456" });
    const rows = await audits();
    expect(rows).toHaveLength(3);
    // Same columns, same types (on_behalf_of is null only for a person acting directly), same before/after fields.
    const shape = (r: Record<string, unknown>) => ({
      columns: Object.entries(r).filter(([k]) => k !== "on_behalf_of").map(([k, v]) => [k, typeof v]),
      before: Object.keys(r.before as object).sort(),
      after: Object.keys(r.after as object).sort(),
    });
    expect(new Set(rows.map((r) => JSON.stringify(shape(r)))).size).toBe(1);
    expect(rows.map((r) => r.source)).toEqual(["ui", "mcp", "job"]);
    expect(rows.map((r) => r.on_behalf_of)).toEqual([null, "user:maya", "user:maya"]);
    expect(rows.every((r) => r.action === "core.legal_entity.rename" && r.resource_id === entityId)).toBe(true);
  });

  it("stores classified fields as name + keyed hash, never the value", async () => {
    const [row] = await audits();
    const after = row.after as Record<string, { $class: string; $hmac: string }>;
    expect(after.bankAccount.$class).toBe("bank");
    expect(after.bankAccount.$hmac).toMatch(/^[0-9a-f]{64}$/);
    const all = JSON.stringify(await audits());
    expect(all).not.toContain("LK12-3456");
    expect(all).not.toContain("LK00-OLD");
  });

  it("writes the outbox event in the same transaction", async () => {
    const events = await withTenant(app, T, (tx) => tx.execute(sql`select name from core.event`));
    expect(events.map((e) => e.name)).toEqual(Array(3).fill("core.legal_entity.renamed"));
  });

  it("a failing write leaves no audit row and no event", async () => {
    const broken = defineService({ ...renameEntity.spec, run: async (tx, input, ctx) => { await renameEntity.spec.run(tx, input, ctx); throw new Error("boom"); } });
    await expect(broken(contextFor.ui(T, { id: "user:maya" }), { id: entityId, name: "never" })).rejects.toThrow("boom");
    expect(await audits()).toHaveLength(3);
    const [{ name }] = await withTenant(app, T, (tx) => tx.execute(sql`select name from core.legal_entity`));
    expect(name).toBe("Lumen 2");
  });

  it("authorizes before validating, and validates before writing", async () => {
    setAuthorizer(() => false);
    await expect(renameEntity(contextFor.ui(T, { id: "user:x" }), { bad: true })).rejects.toBeInstanceOf(ForbiddenError);
    setAuthorizer(() => true);
    await expect(renameEntity(contextFor.ui(T, { id: "user:x" }), { id: "nope", name: "" })).rejects.toBeInstanceOf(ValidationError);
    expect(await audits()).toHaveLength(3);
  });
});
