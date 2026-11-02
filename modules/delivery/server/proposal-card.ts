import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import type { ToolCard } from "@amax/core";
import { getRuntime } from "@amax/core/server";
import { ToolError } from "@amax/mcp";

type Create = { projectKey: string; title: string; description?: string; estimateHours?: number; ownerUserId?: string };

const facts = (v: Viewer, a: Create) => withTenant(getRuntime().db, v.tenantId, async (tx) => {
  const [project] = await tx.execute(sql`select id, name, status from delivery.project where key = ${a.projectKey}`);
  const [owner] = await tx.execute(sql`select name from auth.user where id::text = ${a.ownerUserId ?? v.userId} and status = 'active'`);
  return { project, owner: (owner?.name as string | undefined) ?? null };
});

/** 081 AC-13: no card for a proposal that would be refused: an unknown or closed project, or one the viewer can't add to. */
export async function proposeCreate(v: Viewer, a: Create) {
  const { project, owner } = await facts(v, a);
  if (!project) throw new ToolError(`there's no project ${a.projectKey}; list_projects shows the keys`, "invalid_input");
  if (project.status !== "active") throw new ToolError(`${project.name as string} is closed; reopen it before adding proposals`, "invalid_input");
  if (!can(v, "delivery:proposal:create", { projectId: project.id as string })) throw new ToolError(`you can't add proposals to ${project.name as string}`, "invalid_input");
  if (a.ownerUserId && !owner) throw new ToolError("the owner must be an active person in this workspace", "invalid_input");
}

/** 081 AC-14: the create card shows what will be written: project, title, description, estimate and owner. */
export async function createProposalCard(v: Viewer, a: Create): Promise<ToolCard> {
  const { project, owner } = await facts(v, a);
  const name = (project?.name as string | undefined) ?? a.projectKey;
  const who = a.ownerUserId && a.ownerUserId !== v.userId ? owner ?? "Unknown person" : "You";
  return {
    title: `New proposal in ${name}: ${a.title}`,
    look: { kind: "New proposal", subject: a.title, detail: name, who: `owned by ${who === "You" ? "you" : who}` },
    lines: [
      { label: "Project", value: `${name} (${a.projectKey})` },
      { label: "Title", value: a.title },
      ...(a.description ? [{ label: "Description", value: a.description }] : []),
      { label: "Estimate", value: a.estimateHours !== undefined ? `${a.estimateHours} h` : "none" },
      { label: "Owner", value: who },
      { label: "Starts as", value: "Proposed" },
    ],
  };
}
