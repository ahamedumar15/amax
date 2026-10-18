import { z } from "zod";
import { linkGitIdentity, unlinkGitIdentity } from "@amax/auth/git-identity";
import { defineSuggestionKind } from "@amax/agents";
import { createSuggestion } from "@amax/agents/server";
import { contextFor } from "@amax/core/server";

const Link = z.object({ provider: z.enum(["github", "azure-devops"]), login: z.string().min(1), email: z.string().nullable(), userId: z.uuid() });
type Link = z.infer<typeof Link>;

// 008 AC-2: a commit author amax couldn't attribute becomes a suggestion to link their Git login to
// the person with that work email. Until an Admin accepts it, their commits close no tasks.
export const linkIdentity = defineSuggestionKind<Link, { id: string }>({
  kind: "delivery.git-identity",
  title: "Link a Git identity",
  permission: "delivery:identity:link",
  proposed: Link,
  async apply(tx, ctx, p) {
    const g = await linkGitIdentity(tx, ctx.tenantId, p);
    return { applied: { id: g.id }, action: "auth.git_identity.link", resource: "auth.git_identity", resourceId: g.id, after: { provider: p.provider, login: p.login, userId: p.userId } };
  },
  async undo(tx, _ctx, p, a) {
    await unlinkGitIdentity(tx, a.id);
    return { applied: null, action: "auth.git_identity.unlink", resource: "auth.git_identity", resourceId: a.id, before: { provider: p.provider, login: p.login } };
  },
});

export async function suggestLink(tenantId: string, l: Link & { name: string; commit: string }) {
  const by = contextFor.job(tenantId, "delivery.ingest", `user:${l.userId}`);
  return createSuggestion(by, {
    kind: linkIdentity.kind, target: { type: "auth.git_identity", id: `${l.provider}:${l.login}`, label: `${l.login} on ${l.provider === "github" ? "GitHub" : "Azure DevOps"}` },
    title: `Link ${l.login} to ${l.name}`, detail: `Commit ${l.commit.slice(0, 7)} was made as ${l.login}${l.email ? ` (${l.email})` : ""}, which isn't linked to anyone. Link it so their commits close tasks.`,
    proposed: { provider: l.provider, login: l.login, email: l.email, userId: l.userId }, confidence: 0.7, agentName: "Git ingestion", scope: {},
    evidence: [{ type: "record", label: `Commit ${l.commit.slice(0, 7)}`, ref: "/delivery" }],
    source: { channel: "internal", label: l.provider === "github" ? "GitHub push" : "Azure DevOps push", ref: l.commit },
  });
}
