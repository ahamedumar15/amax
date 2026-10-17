import { sql } from "drizzle-orm";
import type { z } from "zod";
import { setTenant, type Db, type Tx } from "@amax/db";
import { appendAudit, redact, type Sensitivity } from "./audit";
import { authorize, ForbiddenError, type ServiceContext } from "./authorize";
import { CancelledByKeyError, claimKey, settleKey, takeIdempotencyKey } from "./idempotency";

export type Emitted = { name: string; payload: object };

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
  /** The service calls assertCan with the loaded record, so qualified grants pass the up-front check. */
  scoped?: boolean;
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
  readonly retryable = false;
  constructor(public issues: z.core.$ZodIssue[]) {
    super(`invalid input: ${issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ")}`);
    this.name = "ValidationError";
  }
}

// authorize → validate → write in a transaction → audit → emit. The write, its audit row, its
// outbox events and (under an idempotency key) its recorded result commit together or not at all.
export function defineService<I, R>(spec: ServiceSpec<I, R>) {
  const call = async (ctx: ServiceContext, raw: unknown): Promise<R> => {
    const { db, auditKey } = getRuntime();
    if (!(await authorize(ctx, spec.action, spec.resource, raw, { scoped: spec.scoped }))) throw new ForbiddenError(spec.action, spec.resource);
    const parsed = spec.input.safeParse(raw);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);
    const key = takeIdempotencyKey();
    return db.transaction(async (tx) => {
      await setTenant(tx, ctx.tenantId);
      // Under an idempotency key, an earlier attempt's result is returned instead of writing again.
      if (key) {
        const prior = await claimKey(tx, ctx.tenantId, key, null);
        if (prior && "cancelled" in prior) throw new CancelledByKeyError(key);
        if (prior) return prior.result as R;
      }
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
      if (key) await settleKey(tx, ctx.tenantId, key, { result: out.result ?? null });
      return out.result;
    });
  };
  return Object.assign(call, { spec });
}
