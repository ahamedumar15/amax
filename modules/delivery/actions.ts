"use server";

import { revalidatePath } from "next/cache";
import { currentViewer } from "@amax/auth";
import { ctxFor } from "./server/context";
import { moveProposal, recordDeployment } from "./server/services";

// Board Move: an explicit, audited action (AC-3).
export async function moveAction(data: FormData) {
  const viewer = await currentViewer();
  await moveProposal(ctxFor(viewer), { key: String(data.get("key")), to: String(data.get("to")) });
  revalidatePath("/delivery", "layout");
}

// Releases: promote to the next environment (records a deployment; Prod releases its proposals).
export async function promoteAction(data: FormData) {
  const viewer = await currentViewer();
  await recordDeployment(ctxFor(viewer), { projectKey: String(data.get("projectKey")), version: String(data.get("version")), environment: String(data.get("environment")) });
  revalidatePath("/delivery", "layout");
}

// ---- 042 release management --------------------------------------------------------------------
import { removeEnvironment, setReleaseProposals, tagRelease, upsertEnvironment, voidDeployment } from "./server/services";

const str = (d: FormData, k: string) => String(d.get(k) ?? "").trim();

export async function environmentAction(data: FormData) {
  const viewer = await currentViewer();
  const projectKey = str(data, "projectKey");
  const op = str(data, "op");
  const ctx = ctxFor(viewer);
  if (op === "remove") await removeEnvironment(ctx, { projectKey, name: str(data, "name") });
  else if (op === "up" || op === "down") await upsertEnvironment(ctx, { projectKey, name: str(data, "name"), position: Math.max(1, Number(data.get("position")) + (op === "up" ? -1 : 1)) });
  else if (op === "prod") await upsertEnvironment(ctx, { projectKey, name: str(data, "name"), isProd: data.get("isProd") !== "true" });
  else await upsertEnvironment(ctx, { projectKey, name: str(data, "name"), rename: str(data, "rename") || undefined });
  revalidatePath("/delivery", "layout");
}

export async function releaseEditAction(data: FormData) {
  const viewer = await currentViewer();
  const ctx = ctxFor(viewer);
  const projectKey = str(data, "projectKey");
  let version = str(data, "version");
  const newVersion = str(data, "newVersion");
  if (newVersion && newVersion !== version) { await tagRelease(ctx, { projectKey, version, newVersion }); version = newVersion; }
  await setReleaseProposals(ctx, { projectKey, version, proposalKeys: data.getAll("proposal").map(String) });
  revalidatePath("/delivery", "layout");
  const { redirect } = await import("next/navigation");
  redirect(`/delivery/releases/${projectKey}/${encodeURIComponent(version)}`);
}

export async function deployAction(data: FormData) {
  const viewer = await currentViewer();
  await recordDeployment(ctxFor(viewer), { projectKey: str(data, "projectKey"), version: str(data, "version"), environment: str(data, "environment"),
    status: (str(data, "status") || "deployed") as "deployed" | "testing" | "rolled-back", note: str(data, "note") || undefined });
  revalidatePath("/delivery", "layout");
}

export async function voidAction(data: FormData) {
  const viewer = await currentViewer();
  await voidDeployment(ctxFor(viewer), { projectKey: str(data, "projectKey"), version: str(data, "version"), environment: str(data, "environment"), reason: str(data, "reason") });
  revalidatePath("/delivery", "layout");
}
