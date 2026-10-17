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
