import { sql } from "drizzle-orm";
import { z } from "zod";
import { canEver, viewerOf, type Viewer } from "@amax/auth";
import { defineService, ForbiddenError, getRuntime } from "@amax/core/server";
import { withTenant } from "@amax/db";
import { ToolError } from "@amax/mcp";
import { normaliseRepo, RepoUrl } from "../sync/repo-url";
import { insertProject, projectInput } from "./project-create";
import { storeLink } from "./repo-sync";

const base = projectInput.omit({ managerName: true });
const repo = { repoUrl: RepoUrl.optional(), defaultBranch: z.string().trim().min(1).max(200).optional() };
export const SetUpInput = base.extend(repo);
export const SetUpDraft = base.partial().extend(repo);
export type SetUp = z.infer<typeof SetUpInput>;

export const setUpProject = defineService({
  name: "delivery.project.setup",
  action: "delivery:project:create",
  resource: "delivery.project",
  input: SetUpInput,
  async run(tx, input, ctx) {
    const v = viewerOf(ctx);
    if (input.repoUrl && v && !canEver(v, "delivery:project:link")) throw new ForbiddenError("delivery:project:link", "delivery.project");
    const { repoUrl: url, defaultBranch, ...project } = input;
    const made = await insertProject(tx, project, ctx);
    const repoUrl = url ? normaliseRepo(url) : null;
    const branch = repoUrl ? defaultBranch ?? "main" : null;
    if (repoUrl) await storeLink(tx, made.result.id, repoUrl, branch);
    const result = { id: made.result.id, key: made.result.key, repoUrl, defaultBranch: branch };
    return { result, resourceId: made.result.id, after: { ...project, repoUrl, defaultBranch: branch } };
  },
});

const KEY = /^[A-Z][A-Z0-9]{1,9}$/;

export async function proposeSetUp(viewer: Viewer, input: Partial<SetUp>) {
  if (input.repoUrl && !canEver(viewer, "delivery:project:link")) throw new ToolError("only a PM or an Admin can link a repo", "invalid_input", "repoUrl");
  if (!input.key) return;
  if (!KEY.test(input.key)) throw new ToolError("2–10 capitals or digits, starting with a letter", "invalid_input", "key");
  const [taken] = await withTenant(getRuntime().db, viewer.tenantId, (tx) => tx.execute(sql`select name from delivery.project where key = ${input.key}`));
  if (taken) throw new ToolError(`${input.key} is taken (${String(taken.name)})`, "invalid_input", "key");
}
