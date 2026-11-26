import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import type { CardField, ToolCard } from "@amax/core";
import { getRuntime } from "@amax/core/server";
import { ToolError } from "@amax/mcp";
import { nextVersion } from "./pin-offers";
import { clockOf } from "./queries";
import { candidates, moveRefusal, notReleasable, openElsewhere, releaseProposals, type ReleaseProposal } from "./release-proposals";
import { CATEGORIES, CategoryInput, categoryLabel, Day, Keys, releaseDay, statusLabel } from "./release-status";
import { categoryProblem, datesProblem, zoneOf } from "./release-tracking";

export const ReleaseDraft = z.object({ projectKey: z.string(), version: z.string().optional(), name: z.string().optional(), category: z.string().optional(),
  startDate: z.string().optional(), targetDate: z.string().optional(), proposalKeys: Keys.optional(), reassign: Keys.optional() });
type Draft = z.infer<typeof ReleaseDraft>;

const inTenant = <T>(v: Viewer, fn: (tx: Tx) => Promise<T>) => withTenant(getRuntime().db, v.tenantId, fn);
const projectOf = async (tx: Tx, key: string) => (await tx.execute(sql`select * from delivery.project where key = ${key}`))[0];
const fail = (message: string, field?: string) => new ToolError(message, "invalid_input", field);

const option = (p: ReleaseProposal) => ({ value: p.key, label: `${p.key} ${p.title}`,
  ...(p.openRelease ? { detail: [`in ${p.openRelease.version}`, categoryLabel(p.openRelease.category), statusLabel(p.openRelease.status)].filter(Boolean).join(" · ") } : {}) });

async function fieldsFor(tx: Tx, project: Record<string, unknown>): Promise<CardField[]> {
  const [latest] = await tx.execute(sql`select version from delivery.release where project_id = ${project.id} order by created_at desc limit 1`);
  const proposals = await releaseProposals(tx, project.key as string);
  return [
    { name: "name", label: "Name", kind: "text" },
    { name: "version", label: "Version", kind: "text", value: nextVersion((latest?.version as string | undefined) ?? null) },
    { name: "category", label: "Category", kind: "chips", options: CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c)! })) },
    { name: "startDate", label: "Start (YYYY-MM-DD)", kind: "text", value: releaseDay(await zoneOf(tx, project), await clockOf(tx)) },
    { name: "targetDate", label: "Target (YYYY-MM-DD)", kind: "text" },
    { name: "proposalKeys", label: "Proposals (Verified or Released)", kind: "checks", options: proposals.map(option), empty: `No Verified or Released proposals in ${project.name as string} yet` },
    { name: "reassign", label: "Move from their release", kind: "checks", of: "proposalKeys",
      options: proposals.filter((p) => p.openRelease).map((p) => ({ value: p.key, label: `${p.key} from ${p.openRelease!.version}` })) },
  ];
}

export async function releaseCard(v: Viewer, a: Draft): Promise<ToolCard> {
  const card = await inTenant(v, async (tx) => {
    const project = await projectOf(tx, a.projectKey);
    return project ? { name: project.name as string, fields: await fieldsFor(tx, project) } : null;
  });
  const n = a.proposalKeys?.length ?? 0;
  return {
    title: `New release for ${a.projectKey}${card ? ` · ${card.name}` : ""}`, lines: [],
    look: { kind: "New release", confirm: "Create", done: `Created ${a.name ?? "the release"} (${a.version ?? ""}) · ${n} ${n === 1 ? "proposal" : "proposals"}` },
    ...(card ? { form: { fields: card.fields, confirm: { label: "Create {name}", unless: { field: "name", label: "Create" } } } } : {}),
  };
}

async function proposalProblem(tx: Tx, projectId: unknown, keys: string[], reassign: string[]) {
  for (const key of keys) {
    const [p] = await candidates(tx, sql`p.key = ${key} and p.project_id = ${projectId}`);
    const problem = !p ? `no proposal ${key} in this project` : notReleasable(p, null) ?? (openElsewhere(p, null) && !reassign.includes(key) ? moveRefusal(p) : null);
    if (problem) return problem;
  }
  return null;
}

export const proposeRelease = (v: Viewer, a: Draft) => inTenant(v, async (tx) => {
  const project = await projectOf(tx, a.projectKey);
  if (!project) throw fail(`no project ${a.projectKey}`);
  if (!can(v, "delivery:release:create", { projectId: project.id as string })) throw fail(`You can't create releases in ${a.projectKey}`);
  if (a.name !== undefined && !a.name.trim()) throw fail("the release needs a name", "name");
  const [taken] = a.version ? await tx.execute(sql`select 1 from delivery.release where project_id = ${project.id} and version = ${a.version}`) : [];
  if (taken) throw fail(`${a.projectKey} already has a release ${a.version}`, "version");
  const category = a.category === undefined ? undefined : CategoryInput.safeParse(a.category);
  if (category && !category.success) throw fail("the category is Dev, UAT or Prod", "category");
  const noEnv = category?.success ? await categoryProblem(tx, project, category.data) : null;
  if (noEnv) throw fail(noEnv, "category");
  for (const field of ["startDate", "targetDate"] as const) if (a[field] && !Day.safeParse(a[field]).success) throw fail("a date is YYYY-MM-DD, a real calendar day", field);
  const order = a.startDate && a.targetDate ? datesProblem(a.startDate, a.targetDate) : null;
  if (order) throw fail(order, "targetDate");
  const bad = await proposalProblem(tx, project.id, a.proposalKeys ?? [], a.reassign ?? []);
  if (bad) throw fail(bad, "proposalKeys");
});

