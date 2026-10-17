import type { Replay, ServiceContext } from "@amax/core/server";
import { createSourcedProject, type CreatedProject, type ProjectInput } from "./project-create";

export const PROJECT_CREATE_PERMISSION = createSourcedProject.spec.action;

export type CreateProjectInput = ProjectInput;
export type CreateProjectResult = CreatedProject & { replayed?: true };

/**
 * Creates a project in its own transaction. Under withIdempotency it is one counted write, and a
 * replay comes back as the same project's id and key with `replayed: true`. A taken key, or a
 * sourceRef that already made a project under another key, throws ProjectConflictError.
 */
export async function createProject(ctx: ServiceContext, input: CreateProjectInput): Promise<CreateProjectResult> {
  const r = (await createSourcedProject(ctx, input)) as CreatedProject | Replay;
  if (!("replayed" in r)) return r;
  if (!r.resourceId || !r.key) throw new Error("delivery: the replayed project create names no project");
  return { id: r.resourceId, key: r.key, replayed: true };
}
