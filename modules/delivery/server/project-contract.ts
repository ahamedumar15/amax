import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { appendAudit, authorize, ForbiddenError, ValidationError, type Replay, type ServiceContext } from "@amax/core/server";
import { createProjectService, insertProject, projectInput, type CreatedProject, type ProjectInput } from "./project-create";

export const PROJECT_CREATE_PERMISSION = "delivery:project:create";
const RESOURCE = "delivery.project";

export type CreateProjectInput = ProjectInput;
export type CreateProjectResult = CreatedProject & { replayed?: true };

/**
 * Creates a project in its own transaction. Under withIdempotency it is one counted write, and a
 * replay comes back as the same project's id and key with `replayed: true`.
 */
export async function createProject(ctx: ServiceContext, input: CreateProjectInput): Promise<CreateProjectResult> {
  const r = (await createProjectService(ctx, input)) as CreatedProject | Replay;
  if (!("replayed" in r)) return r;
  if (!r.resourceId || !r.key) throw new Error("delivery: the replayed project create names no project");
  return { id: r.resourceId, key: r.key, replayed: true };
}

/**
 * Creates a project inside the caller's tenant transaction (withTenant), so it commits or rolls
 * back with the caller's writes. Same authorization, validation and audit as createProject. Not
 * counted by withIdempotency: the caller's transaction, or a `sourceRef`, makes a retry safe.
 */
export async function createProjectInTx(tx: Tx, ctx: ServiceContext, input: CreateProjectInput): Promise<CreatedProject> {
  const [{ tenant }] = await tx.execute(sql`select current_setting('app.tenant_id', true) as tenant`);
  if (tenant !== ctx.tenantId) throw new Error("delivery: createProjectInTx needs a transaction for the context's tenant (use withTenant)");
  if (!(await authorize(ctx, PROJECT_CREATE_PERMISSION, RESOURCE, input))) throw new ForbiddenError(PROJECT_CREATE_PERMISSION, RESOURCE);
  const parsed = projectInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const out = await insertProject(tx, parsed.data, ctx);
  await appendAudit(tx, ctx, { action: createProjectService.spec.name, resource: RESOURCE, resourceId: out.resourceId, before: null, after: out.after });
  return out.result;
}
