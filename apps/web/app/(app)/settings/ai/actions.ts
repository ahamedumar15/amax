"use server";

import { revalidatePath } from "next/cache";
import { savePolicy } from "@amax/ai/admin";
import { SENSITIVITY_CLASSES } from "@amax/core/server";
import { currentViewer, rolesOf } from "@amax/auth";
import { getDb } from "../../../../lib/server";

const region = (v: FormDataEntryValue | null) => (String(v ?? "").trim() || null);

export async function savePolicyAction(data: FormData) {
  const viewer = await currentViewer();
  await savePolicy(getDb()!, { tenantId: viewer.tenantId, userId: viewer.userId, roles: rolesOf(viewer) }, {
    allowedClasses: SENSITIVITY_CLASSES.filter((c) => data.get(`class-${c}`) === "on"),
    zdrConfirmed: data.get("zdrConfirmed") === "on",
    voiceEnabled: data.get("voiceEnabled") === "on",
    enabled: data.get("enabled") === "on",
    dataRegion: region(data.get("dataRegion")),
    providerRegion: region(data.get("providerRegion")),
    aiRegion: region(data.get("aiRegion")),
    dbRegion: region(data.get("dbRegion")),
    storageRegion: region(data.get("storageRegion")),
  });
  revalidatePath("/settings/ai");
}
