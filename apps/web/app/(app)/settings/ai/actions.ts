"use server";

import { revalidatePath } from "next/cache";
import { savePolicy } from "@amax/ai/admin";
import { currentViewer, rolesOf } from "@amax/auth";
import { getDb } from "../../../../lib/server";

const CLASSES = ["pay", "health", "bank", "performance", "candidate"];
const region = (v: FormDataEntryValue | null) => (String(v ?? "").trim() || null);

export async function savePolicyAction(data: FormData) {
  const viewer = await currentViewer();
  if (!rolesOf(viewer).includes("Admin")) throw new Error("forbidden: Admin only");
  await savePolicy(getDb()!, viewer.tenantId, `user:${viewer.userId}`, {
    allowedClasses: CLASSES.filter((c) => data.get(`class-${c}`) === "on"),
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
