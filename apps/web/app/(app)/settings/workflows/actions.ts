"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentViewer, rolesOf } from "@amax/auth";
import { setScheduleEnabled } from "@amax/workflows/server";
import { getDb, workflowEngine } from "../../../../lib/server";

const toggle = z.object({ id: z.uuid(), enabled: z.enum(["true", "false"]) });
const runAction = z.object({ id: z.uuid(), action: z.enum(["pause", "resume", "cancel", "retry"]) });

async function admin() {
  const viewer = await currentViewer();
  return { tenantId: viewer.tenantId, userId: viewer.userId, roles: rolesOf(viewer) };
}

export async function toggleScheduleAction(data: FormData) {
  const input = toggle.parse({ id: data.get("id"), enabled: data.get("enabled") });
  await setScheduleEnabled(getDb()!, await admin(), input.id, input.enabled === "true");
  revalidatePath("/settings/workflows");
}

export async function runControlAction(data: FormData) {
  const input = runAction.parse({ id: data.get("id"), action: data.get("action") });
  await (await workflowEngine()).control(await admin(), input.id, input.action);
  revalidatePath("/settings/workflows");
}
