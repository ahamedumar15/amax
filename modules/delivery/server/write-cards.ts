import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import type { Viewer } from "@amax/auth";
import type { ToolCard } from "@amax/core";
import { getRuntime } from "@amax/core/server";

// 081 amendment 3: the confirm cards for the writes Delivery's pins offer (releases, deployments, environments, tasks,
// repos), so the card says what will happen and its receipt what did, instead of the tool's description and raw
// arguments. Receipts keep chat's "Done:" so a receipt reads the same way across the app.
const card = (title: string, kind: string, lines: [string, string | undefined | null][], done: string, subject?: string): ToolCard => ({
  title, lines: lines.filter(([, v]) => v !== undefined && v !== null && v !== "").map(([label, value]) => ({ label, value: value as string })),
  look: { kind, subject: subject ?? title, done: `Done: ${done}` },
});

export const createReleaseCard = async (_v: Viewer, a: { projectKey: string; version: string; proposalKeys?: string[] }) =>
  card(`Create release ${a.version} of ${a.projectKey}`, "New release", [["Project", a.projectKey], ["Version", a.version], ["Proposals", a.proposalKeys?.join(", ") || "none yet"]], `created ${a.projectKey} ${a.version}`);

export const deploymentCard = async (_v: Viewer, a: { projectKey: string; version: string; environment: string; status?: string; note?: string }) =>
  card(`Record ${a.projectKey} ${a.version} in ${a.environment}`, "Record a deployment", [["Release", `${a.projectKey} ${a.version}`], ["Environment", a.environment],
    ["Status", a.status ?? "deployed"], ["Note", a.note]], `recorded ${a.projectKey} ${a.version} in ${a.environment}`);

export const voidCard = async (_v: Viewer, a: { projectKey: string; version: string; environment: string; reason: string }) =>
  card(`Void the ${a.environment} deployment of ${a.projectKey} ${a.version}`, "Void a deployment", [["Release", `${a.projectKey} ${a.version}`], ["Environment", a.environment], ["Reason", a.reason],
    ["Kept", "the record stays in the history, marked voided"]], `voided the ${a.environment} deployment of ${a.projectKey} ${a.version}`);

export const tagCard = async (_v: Viewer, a: { projectKey: string; version: string; newVersion: string }) =>
  card(`Re-tag ${a.projectKey} ${a.version} as ${a.newVersion}`, "Re-tag a release", [["Release", `${a.projectKey} ${a.version}`], ["New tag", a.newVersion]], `${a.projectKey} ${a.version} is now ${a.newVersion}`);

export const releaseProposalsCard = async (_v: Viewer, a: { projectKey: string; version: string; proposalKeys: string[] }) =>
  card(`Set the proposals in ${a.projectKey} ${a.version}`, "Change a release", [["Release", `${a.projectKey} ${a.version}`], ["Proposals", a.proposalKeys.join(", ") || "none"],
    ["Kept", "proposals already released stay"]], `${a.projectKey} ${a.version} holds ${a.proposalKeys.length} proposal${a.proposalKeys.length === 1 ? "" : "s"}`);

export async function environmentCard(v: Viewer, a: { projectKey: string; name: string; rename?: string; position?: number; isProd?: boolean }) {
  const [had] = await withTenant(getRuntime().db, v.tenantId, (tx) => tx.execute(sql`select 1 from delivery.environment e join delivery.project p on p.id = e.project_id
    where p.key = ${a.projectKey} and lower(e.name) = lower(${a.name})`));
  const name = a.rename ?? a.name;
  const what = !had ? `Add ${name} to ${a.projectKey}${a.isProd ? " as Prod" : ""}` : a.rename ? `Rename ${a.projectKey} ${a.name} to ${a.rename}`
    : a.isProd === true ? `Make ${a.name} the Prod environment of ${a.projectKey}` : a.isProd === false ? `Unmark ${a.name} as ${a.projectKey}'s Prod`
    : a.position ? `Move ${a.projectKey} ${a.name} to position ${a.position}` : `Keep ${a.projectKey} ${a.name} as it is`;
  const done = !had ? `added ${name} to ${a.projectKey}` : a.rename ? `${a.projectKey} ${a.name} is now ${a.rename}` : a.isProd === true ? `${a.name} is ${a.projectKey}'s Prod`
    : a.isProd === false ? `${a.name} is no longer ${a.projectKey}'s Prod` : `moved ${a.projectKey} ${a.name}`;
  return card(what, "Environment", [["Project", a.projectKey], ["Environment", a.name], ["New name", a.rename], ["Position", a.position ? String(a.position) : undefined],
    ["Prod", a.isProd === undefined ? undefined : a.isProd ? "yes (the others are unmarked)" : "no"]], done);
}

export const removeEnvironmentCard = async (_v: Viewer, a: { projectKey: string; name: string }) =>
  card(`Remove ${a.projectKey} ${a.name}`, "Remove an environment", [["Project", a.projectKey], ["Environment", a.name]], `removed ${a.projectKey} ${a.name}`);

export async function taskDoneCard(v: Viewer, a: { key: string; task: string; commit?: string }) {
  const [t] = await withTenant(getRuntime().db, v.tenantId, (tx) => tx.execute(sql`select t.title from delivery.task t join delivery.proposal p on p.id = t.proposal_id where p.key = ${a.key} and t.ref = ${a.task}`));
  return card(`Mark ${a.task} of ${a.key} done`, "Close a task", [["Proposal", a.key], ["Task", t ? `${a.task} ${t.title as string}` : a.task], ["Commit", a.commit]], `closed ${a.task} of ${a.key}`);
}

export const linkCard = async (_v: Viewer, a: { projectKey: string; repoUrl: string; defaultBranch?: string }) =>
  card(`Link ${a.projectKey}'s repo`, "Link a repo", [["Project", a.projectKey], ["Repo", a.repoUrl], ["Default branch", a.defaultBranch]], `${a.projectKey} syncs from ${a.repoUrl}`);

export const unlinkCard = async (_v: Viewer, a: { projectKey: string }) =>
  card(`Unlink ${a.projectKey}'s repo`, "Unlink a repo", [["Project", a.projectKey], ["After", "no specclaw push is accepted until a repo is linked again"]], `unlinked ${a.projectKey}'s repo`);
