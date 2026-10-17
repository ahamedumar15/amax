import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { withTenant } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { canSee, defineQuery, isMasked, setGrants, type Viewer } from "../src";
import { AU, LK, viewer } from "./fixtures";

const T = "11111111-1111-4111-8111-111111111111";

// A payslip query as a payroll module would declare it.
type Payslip = { userId: string; legalEntityId: string; month: string; gross: string; net: string; bankAccount: string };
const getPayslips = defineQuery<{ month: string }, Payslip, "gross" | "net" | "bankAccount">({
  name: "payroll.payslip.list",
  action: "payroll:payslip:read",
  input: z.object({ month: z.string() }),
  sensitive: { gross: "pay", net: "pay", bankAccount: "bank" },
  subject: (r) => ({ ownerUserId: r.userId, legalEntityId: r.legalEntityId }),
  run: async (tx, input) =>
    (await tx.execute(sql`select user_id as "userId", legal_entity_id as "legalEntityId", month, gross, net, bank_account as "bankAccount"
                          from test_payroll.payslip where month = ${input.month} order by user_id`)) as unknown as Payslip[],
});

// The three read paths: a page loader, a contract function another module imports, an MCP tool.
const pageLoader = (v: Viewer) => getPayslips(v, { month: "2026-10" });
const contract = { payslipsFor: (v: Viewer, month: string) => getPayslips(v, { month }) };
const mcpTool = { name: "list_payslips", handler: (args: { month: string }, auth: { viewer: Viewer }) => getPayslips(auth.viewer, args) };

describe("AC-4 sensitivity policy", () => {
  it("health: HR and the person; bank: Payroll and the person", () => {
    expect(canSee(viewer("hr", ["HR"]), "health", { ownerUserId: "kasun" })).toBe(true);
    expect(canSee(viewer("kasun", ["Employee"]), "health", { ownerUserId: "kasun" })).toBe(true);
    expect(canSee(viewer("maya", ["PM", "Leadership"]), "health", { ownerUserId: "kasun" })).toBe(false);
    expect(canSee(viewer("sahan", ["Admin"]), "bank", { ownerUserId: "kasun" })).toBe(false);
    expect(canSee(viewer("p", ["Payroll"]), "bank", { ownerUserId: "kasun" })).toBe(true);
  });
  it("performance: the manager sees reports' reviews", () => {
    expect(canSee(viewer("maya", ["PM"], { reports: ["kasun"] }), "performance", { ownerUserId: "kasun" })).toBe(true);
    expect(canSee(viewer("maya", ["PM"], { reports: ["kasun"] }), "performance", { ownerUserId: "liam" })).toBe(false);
  });
});

describe.skipIf(!hasDb)("AC-4 masking on every read path", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  const reader = ["PM", "Payroll", "Employee"] as const;

  beforeAll(async () => {
    t = await migratedDatabase();
    await t.owner.unsafe(`
      create schema test_payroll;
      create table test_payroll.payslip (tenant_id uuid not null, user_id text, legal_entity_id uuid, month text, gross numeric, net numeric, bank_account text);
      select core.enable_tenant_rls('test_payroll.payslip');
      grant usage on schema test_payroll to amax_app; grant select on test_payroll.payslip to amax_app;`);
    await t.owner`insert into core.tenant (id, name) values (${T}, 'Lumen Labs')`;
    await t.owner`insert into core.legal_entity (id, tenant_id, name, country, base_currency) values (${LK}, ${T}, 'LK', 'LK', 'LKR'), (${AU}, ${T}, 'AU', 'AU', 'AUD')`;
    await t.owner`insert into test_payroll.payslip values
      (${T}, 'kasun', ${LK}, '2026-10', 285000, 241000, 'LK12-3456'),
      (${T}, 'liam', ${AU}, '2026-10', 15000, 11200, 'AU98-7654')`;
    configureRuntime({ db: t.app(), auditKey: "k".repeat(32) });
    setGrants([{ grants: Object.fromEntries(reader.map((r) => [r, ["payroll:payslip:read"]])) }]);
  });
  afterAll(() => t?.drop());

  const paths = (v: Viewer) => Promise.all([pageLoader(v), contract.payslipsFor(v, "2026-10"), mcpTool.handler({ month: "2026-10" }, { viewer: v })]);

  it("a PM gets masked pay and bank through a page, a contract and MCP", async () => {
    for (const rows of await paths(viewer("maya", ["PM", "Leadership"]))) {
      expect(rows).toHaveLength(2);
      for (const r of rows) {
        expect(isMasked(r.gross) && isMasked(r.net) && isMasked(r.bankAccount)).toBe(true);
        expect(JSON.stringify(r)).not.toMatch(/285000|241000|LK12|15000|AU98/);
        expect(r.month).toBe("2026-10");
      }
    }
  });

  it("Payroll sees pay and bank, within its legal entity only", async () => {
    for (const rows of await paths(viewer("p", [{ role: "Payroll", legalEntityIds: [LK], departments: null }]))) {
      const [kasun, liam] = rows;
      expect(kasun).toMatchObject({ gross: "285000", bankAccount: "LK12-3456" });
      expect(isMasked(liam.gross) && isMasked(liam.bankAccount)).toBe(true);
    }
  });

  it("the person sees their own payslip, not anyone else's", async () => {
    for (const rows of await paths(viewer("kasun", ["Employee"]))) {
      expect(rows[0]).toMatchObject({ gross: "285000", bankAccount: "LK12-3456" });
      expect(isMasked(rows[1].gross)).toBe(true);
    }
  });

  it("roles without the read permission are refused outright", async () => {
    await expect(pageLoader(viewer("f", ["Finance"]))).rejects.toThrow(/forbidden/);
  });

  it("RLS still applies underneath: another tenant's viewer reads nothing", async () => {
    const other = { ...viewer("x", ["Payroll"]), tenantId: "22222222-2222-4222-8222-222222222222" };
    expect(await withTenant(t.app(), other.tenantId, (tx) => tx.execute(sql`select * from test_payroll.payslip`))).toHaveLength(0);
  });
});
