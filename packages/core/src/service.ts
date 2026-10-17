import { sql } from "drizzle-orm";
import type { z } from "zod";
import { setTenant, type Db, type Tx } from "@amax/db";
import { appendAudit, redact, type Sensitivity } from "./audit";
import { authorize, ForbiddenError, type ServiceContext } from "./authorize";

export type Emitted = { name: string; payload: Record<string, unknown> };

export type ServiceOutcome<R> = {
  result: R;
  resourceId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  events?: Emitted[];
};

export type ServiceSpec<I, R> = {
  /** Audit action and default event prefix, e.g. "hr.employee.update". */
  name: string;
  action: string;
  resource: string;
  input: z.ZodType<I>;
  /** Classified fields: audited as name + keyed hash, never the value. */
  sensitive?: Record<string, Sensitivity>;
  run: (tx: Tx, input: I, ctx: ServiceContext) => Promise<ServiceOutcome<R>>;
};

export type Runtime = { db: Db; auditKey: string };
let runtime: Runtime | undefined;

export const configureRuntime = (r: Runtime) => {
  runtime = r;
};

export function getRuntime(): Runtime {
  if (!runtime) throw new Error("amax: configureRuntime({ db, auditKey }) before calling services");
  return runtime;
}

export class ValidationError extends Error {
  constructor(public issues: z.core.$ZodIssue[]) {
    super(`invalid input: ${issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ")}`);
    this.name = "ValidationError";
  }
}

// authorize → validate → write in a transaction → audit → emit. The write, its audit row and its
// outbox events commit together or not at all.
export function defineService<I, R>(spec: ServiceSpec<I, R>) {
  const call = async (ctx: ServiceContext, raw: unknown): Promise<R> => {
    const { db, auditKey } = getRuntime();
    if (!(await authorize(ctx, spec.action, spec.resource, raw))) throw new ForbiddenError(spec.action, spec.resource);
    const parsed = spec.input.safeParse(raw);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    return db.transaction(async (tx) => {
      await setTenant(tx, ctx.tenantId);
      const out = await spec.run(tx, parsed.data, ctx);
      const sensitive = spec.sensitive ?? {};
      await appendAudit(tx, ctx, {
        action: spec.name,
        resource: spec.resource,
        resourceId: out.resourceId,
        before: redact(out.before, sensitive, auditKey),
        after: redact(out.after, sensitive, auditKey),
      });
      for (const e of out.events ?? []) {
        await tx.execute(sql`insert into core.event (tenant_id, name, payload) values (${ctx.tenantId}, ${e.name}, ${JSON.stringify(e.payload)}::jsonb)`);
      }
      return out.result;
    });
  };
  return Object.assign(call, { spec });
}
