import { sql } from "drizzle-orm";
import { z } from "zod";
import { migratedDatabase } from "@amax/db/testdb";
import { withTenant, type Db, type Tx } from "@amax/db";
import { configureRuntime, contextFor, type ServiceContext } from "@amax/core/server";
import { contextForViewer, installAuthorizer, setGrants, type Role, type Viewer } from "@amax/auth";
import { agentsPlatform, defineSuggestionKind, setSuggestionKinds } from "../src/server";

export const T = "06060606-0000-4000-8000-000000000006";
export const OTHER = "06060606-0000-4000-8000-000000000007";
export const MAYA = "06060606-0000-4000-8000-0000000000a1";
export const ANA = "06060606-0000-4000-8000-0000000000a2";
export const KASUN = "06060606-0000-4000-8000-0000000000a3";
export const PROJECT = "06060606-0000-4000-8000-0000000000b1";
export const ELSEWHERE = "06060606-0000-4000-8000-0000000000b2";

export const viewer = (userId: string, roles: Role[], managed: string[] = []): Viewer => ({
  tenantId: T, userId, name: userId.slice(-2), email: `${userId.slice(-2)}@example.test`, assignments: roles.map((role) => ({ role, legalEntityIds: null, departments: null })),
  actualRoles: roles, managedProjects: managed, assignedProjects: [], reports: [],
});
export const person = (v: Viewer): ServiceContext => contextForViewer(v, "chat");
export const agentFor = (userId: string, tenantId = T) => contextFor.job(tenantId, "agents.test", `user:${userId}`);

const Setting = z.object({ key: z.string().min(1), value: z.number().int(), cutoff: z.string().optional() });
type Setting = z.infer<typeof Setting>;
const value = async (tx: Tx, key: string) => ((await tx.execute(sql`select v from public.demo_setting where k = ${key}`))[0]?.v as number | undefined) ?? null;
async function put(tx: Tx, ctx: ServiceContext, key: string, v: number | null) {
  await tx.execute(sql`delete from public.demo_setting where k = ${key}`);
  if (v !== null) await tx.execute(sql`insert into public.demo_setting (tenant_id, k, v) values (${ctx.tenantId}, ${key}, ${v})`);
}
const write = async (tx: Tx, ctx: ServiceContext, p: Setting, to: number | null) => {
  const was = await value(tx, p.key);
  await put(tx, ctx, p.key, to);
  return { applied: { was }, action: "demo.setting.set", resource: "demo.setting", resourceId: p.key, before: { value: was }, after: { value: to } };
};

/** A fictional module's kinds: a plain setting, a sensitive one (pay) and an irreversible one. */
export const kinds = [
  defineSuggestionKind<Setting, { was: number | null }>({ kind: "demo.setting", title: "Setting change", permission: "demo:set", proposed: Setting,
    apply: (tx, ctx, p) => write(tx, ctx, p, p.value), undo: (tx, ctx, p, a) => write(tx, ctx, p, a.was), cutoff: (p) => (p.cutoff ? new Date(p.cutoff) : null) }),
  defineSuggestionKind<Setting, { was: number | null }>({ kind: "demo.pay", title: "Pay change", permission: "demo:set", proposed: Setting, sensitive: true, fields: { value: "pay" },
    apply: (tx, ctx, p) => write(tx, ctx, p, p.value), undo: (tx, ctx, p, a) => write(tx, ctx, p, a.was) }),
  defineSuggestionKind<Setting, { was: number | null }>({ kind: "demo.bankfile", title: "Bank file", permission: "demo:set", proposed: Setting, sensitive: true, irreversible: true,
    apply: (tx, ctx, p) => write(tx, ctx, p, p.value) }),
];

export const proposal = (over: Record<string, unknown> = {}) => ({
  kind: "demo.setting", target: { type: "demo.setting", id: "limit", label: "Limit" }, title: "Raise the limit to 5", proposed: { key: "limit", value: 5 },
  evidence: [{ type: "record" as const, label: "Usage last month", ref: "demo:usage" }], confidence: 0.8, agentName: "Demo agent", scope: { projectId: PROJECT }, ...over,
});

export async function agentsDb() {
  const t = await migratedDatabase();
  const app = t.app();
  configureRuntime({ db: app, auditKey: "k".repeat(32) });
  setGrants([agentsPlatform, { grants: { PM: ["demo:set@managed"], Engineer: [] } }]);
  installAuthorizer();
  setSuggestionKinds(kinds);
  await t.owner`insert into core.tenant (id, name) values (${T}, 'Lumen Labs'), (${OTHER}, 'Harbour Works')`;
  await t.owner.unsafe(`create table public.demo_setting (tenant_id uuid not null, k text not null, v int not null); grant select, insert, delete on public.demo_setting to amax_app`);
  const setting = (key: string) => withTenant(app, T, (tx) => value(tx, key));
  const audit = (action: string) => withTenant(app, T, (tx) => tx.execute(sql`select actor, on_behalf_of, after from core.audit_event where action = ${action} order by seq`));
  return { t, app: app as Db, setting, audit };
}
