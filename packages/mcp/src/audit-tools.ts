import { inArray } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@amax/db";
import { auditStatus, getRuntime, getTrace, searchAudit, type AuditEntry, type AuditFilter } from "@amax/core/server";
import { assertCan, pricedFor, type Viewer } from "@amax/auth";
import { user } from "@amax/auth/schema";
import type { RegisteredTool } from "./registry";

/** 050: one permission for the Audit and trace screen and these tools: Admin, and IT Admin by grant (055). */
export const AUDIT_READ = "core.audit.read";

// 055: a trace step's model cost is left out for a viewer without the pricing class (IT Admin).
const read = <T>(viewer: Viewer, fn: (tx: Parameters<Parameters<typeof withTenant>[2]>[0]) => Promise<T>) => {
  assertCan(viewer, AUDIT_READ);
  return withTenant(getRuntime().db, viewer.tenantId, fn).then((x) => pricedFor(viewer, x));
};

// The audit chains are append-only, so a pin on them is a view (059): nothing in it is renamed.
const tool = (name: string, description: string, input: z.ZodType, run: (viewer: Viewer, input: never) => Promise<unknown>) =>
  ({ module: "core", name, description, input, permission: AUDIT_READ, scope: "read", readOnly: true, pin: "view", run }) as unknown as RegisteredTool;

export const auditTools = (): RegisteredTool[] => [
  tool("audit_status", "Audit and trace chain status, the last write-once export and refused tool calls today. verify: true checks both chains again now.",
    z.object({ verify: z.boolean().optional() }).strict(),
    (viewer, input: { verify?: boolean }) => read(viewer, (tx) => auditStatus(tx, viewer.tenantId, { fresh: input.verify }))),
  tool("search_audit", "Search audited writes and trace steps by person, agent, tool, record or trace; chain plus seq returns one event.",
    z.object({ query: z.string().max(200).optional(), chain: z.enum(["audit", "trace"]).optional(), seq: z.number().int().positive().optional(), traceId: z.uuid().optional(), sinceDays: z.number().int().min(1).max(3650).optional(), limit: z.number().int().min(1).max(500).optional() }).strict(),
    (viewer, input: Parameters<typeof searchAudit>[2]) => read(viewer, (tx) => searchAudit(tx, viewer.tenantId, input))),
  tool("get_trace", "One trace as a timeline: the prompt received, model calls, tool calls, the pending write, who decided and the audited write.",
    z.object({ traceId: z.uuid() }).strict(),
    (viewer, input: { traceId: string }) => read(viewer, (tx) => getTrace(tx, viewer.tenantId, input.traceId))),
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const userIds = (rows: Pick<AuditEntry, "actor" | "onBehalfOf">[]) =>
  [...new Set(rows.flatMap((e) => [e.actor, e.onBehalfOf]).filter((a): a is string => !!a?.startsWith("user:")).map((a) => a.slice(5)))].filter((id) => UUID.test(id));

/** Everything the Audit and trace screen shows, behind the same permission as the tools. */
export const auditView = (viewer: Viewer, opts: { verify?: boolean; filter: AuditFilter; traceId?: string }) =>
  read(viewer, async (tx) => {
    const status = await auditStatus(tx, viewer.tenantId, { fresh: opts.verify });
    const events = await searchAudit(tx, viewer.tenantId, opts.filter);
    const trace = opts.traceId ? await getTrace(tx, viewer.tenantId, opts.traceId) : null;
    const ids = userIds([...events, ...(trace ?? [])]);
    const users = ids.length ? await tx.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, ids)) : [];
    return { status, events, trace, names: new Map(users.map((u) => [u.id, u.name])) };
  });
