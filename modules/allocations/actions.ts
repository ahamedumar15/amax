"use server";

import { revalidatePath } from "next/cache";
import { currentViewer } from "@amax/auth";
import { ctxFor } from "./server/context";
import { copyMonth } from "./server/services";

// Copy to next month: an explicit, audited bulk action (AC-3).
export async function copyMonthAction(data: FormData) {
  const viewer = await currentViewer();
  await copyMonth(ctxFor(viewer), { from: String(data.get("from") ?? ""), team: String(data.get("team") ?? "Delivery team") });
  revalidatePath("/allocations", "layout");
}
