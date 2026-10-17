import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { viewerOf } from "@amax/auth";
import { defineService, type ServiceContext } from "@amax/core/server";

// Kept apart from services.ts so contracts.ts can publish it without an import cycle
// (services.ts reads PHASES from contracts.ts while it loads).

export const DEFAULT_ENVIRONMENTS = ["Dev", "QA", "UAT", "Prod"];

export async function ensureEnvironments(tx: Tx, tenantId: string, projectId: string) {
  for (const [i, name] of DEFAULT_ENVIRONMENTS.entries()) {
    await tx.execute(sql`insert into delivery.environment (tenant_id, project_id, name, position, is_prod)
      values (${tenantId}, ${projectId}, ${name}, ${i + 1}, ${name === "Prod"}) on conflict do nothing`);
  }
}

export const projectInput = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/, "2–10 capitals or digits, e.g. CON"),
  name: z.string().min(1),
  client: z.string().min(1),
  billing: z.enum(["fixed", "t&m", "retainer", "internal"]),
  managerName: z.string().optional(),
  sourceRef: z.string().min(1).max(200).optional(),
});
export type ProjectInput = z.infer<typeof projectInput>;
export type CreatedProject = { id: string; key: string; existing?: true };

const bySource = async (tx: Tx, sourceRef: string) =>
  (await tx.execute(sql`select id, key from delivery.project where source_ref = ${sourceRef}`))[0];

/** Inserts the project, or returns the one already made from `sourceRef` (a racing create waits, then finds it). */
export async function insertProject(tx: Tx, input: ProjectInput, ctx: ServiceContext) {
  const [p] = await tx.execute(sql`insert into delivery.project (tenant_id, key, name, client, billing, manager_name, manager_user_id, source_ref)
    values (${ctx.tenantId}, ${input.key}, ${input.name}, ${input.client}, ${input.billing}, ${input.managerName ?? null},
            ${viewerOf(ctx)?.userId ?? null}, ${input.sourceRef ?? null})
    on conflict (tenant_id, source_ref) where source_ref is not null do nothing returning id, key`);
  if (!p) {
    const e = await bySource(tx, input.sourceRef!);
    const result: CreatedProject = { id: e.id as string, key: e.key as string, existing: true };
    return { result, resourceId: result.id, after: { ...input, existing: result.key } };
  }
  await ensureEnvironments(tx, ctx.tenantId, p.id as string);
  return { result: { id: p.id as string, key: p.key as string } as CreatedProject, resourceId: p.id as string, after: input };
}

export const createProjectService = defineService({
  name: "delivery.project.create",
  action: "delivery:project:create",
  resource: "delivery.project",
  input: projectInput,
  run: (tx, input, ctx) => insertProject(tx, input, ctx),
});
