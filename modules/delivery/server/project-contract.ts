import { ReplayedError, type ServiceContext } from "@amax/core/server";
import { createSourcedProject, type CreatedProject, type ProjectInput } from "./project-create";

export const PROJECT_CREATE_PERMISSION = createSourcedProject.spec.action;

export type CreateProjectInput = ProjectInput;
export type CreateProjectResult = CreatedProject & { replayed?: true };

/**
 * Creates a project in its own transaction. Under withIdempotency it is one counted write, and a
 * replay comes back as the same project's id and key with `replayed: true`. A taken key, or a
 * sourceRef that already made a project under another key, throws ProjectConflictError.
 */
export const createProject = Object.assign(async (ctx: ServiceContext, input: CreateProjectInput): Promise<CreateProjectResult> => {
  try {
    return await createSourcedProject(ctx, input);
  } catch (e) {
    if (!(e instanceof ReplayedError)) throw e;
    const { resourceId, key } = e.replay;
    if (!resourceId || !key) throw new Error("delivery: the replayed project create names no project");
    return { id: resourceId, key, replayed: true };
  }
}, { spec: createSourcedProject.spec });
