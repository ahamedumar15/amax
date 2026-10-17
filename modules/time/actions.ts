"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentViewer } from "@amax/auth";
import { ctxFor } from "./server/context";
import { approveWeek, remindWeek } from "./server/decide";
import { logTime } from "./server/log";
import { submitWeek } from "./server/submit";

const ids = (data: FormData) => z.array(z.string().uuid()).parse(data.getAll("weekId").map(String));

async function eachWeek(data: FormData, run: typeof approveWeek | typeof remindWeek) {
  const ctx = ctxFor(await currentViewer());
  for (const weekId of ids(data)) await run(ctx, { weekId });
  revalidatePath("/time", "layout");
}

export async function approveAction(data: FormData) {
  await eachWeek(data, approveWeek);
}

export async function remindAction(data: FormData) {
  await eachWeek(data, remindWeek);
}

export async function submitAction(data: FormData) {
  await submitWeek(ctxFor(await currentViewer()), { week: String(data.get("week") ?? "") || undefined });
  revalidatePath("/time", "layout");
}

export async function logAction(data: FormData) {
  await logTime(ctxFor(await currentViewer()), {
    projectKey: String(data.get("projectKey") ?? ""), day: String(data.get("day") ?? "") || undefined,
    hours: Number(data.get("hours")), billable: data.get("billable") === "on", source: "person",
  });
  revalidatePath("/time", "layout");
}
