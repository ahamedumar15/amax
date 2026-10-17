"use server";

import { revalidatePath } from "next/cache";
import { currentViewer } from "@amax/auth";
import type { Stage } from "./contracts";
import { ctxFor } from "./server/context";
import { promoteToDelivery } from "./server/promote";
import { addRisk, addTask, logActivity, setRiskStatus } from "./server/records";
import { moveOpportunity, removeOpportunity } from "./server/opportunities";
import { acceptSuggestion, dismissSuggestion } from "./server/suggestions";

// Every action re-reads the signed-in viewer; the services check permissions, validate and audit.
const str = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
const opt = (d: FormData, k: string) => str(d, k) || undefined;
const ctx = async () => ctxFor(await currentViewer());
const done = () => revalidatePath("/presales", "layout");

export async function moveAction(data: FormData) {
  const chance = opt(data, "winChance");
  await moveOpportunity(await ctx(), { number: str(data, "number"), to: str(data, "to") as Stage, winChance: chance === undefined ? undefined : Number(chance), note: opt(data, "note") });
  done();
}

export async function lostAction(data: FormData) {
  await moveOpportunity(await ctx(), { number: str(data, "number"), to: "lost", reason: str(data, "reason"), competitor: opt(data, "competitor") });
  done();
}

export async function removeAction(data: FormData) {
  await removeOpportunity(await ctx(), { number: str(data, "number") });
  done();
}

export async function suggestionAction(data: FormData) {
  const input = { id: str(data, "id") };
  if (str(data, "op") === "accept") await acceptSuggestion(await ctx(), input);
  else await dismissSuggestion(await ctx(), input);
  done();
}

export async function promoteAction(data: FormData) {
  await promoteToDelivery(await currentViewer(), { number: str(data, "number"), key: str(data, "key").toUpperCase(), billing: str(data, "billing") });
  done();
}

export async function activityAction(data: FormData) {
  await logActivity(await ctx(), { number: str(data, "number"), title: str(data, "title"), kind: str(data, "kind") as "call", on: str(data, "on"), ownerName: opt(data, "ownerName"), note: opt(data, "note"), progress: Number(str(data, "progress") || 0) });
  done();
}

export async function taskAction(data: FormData) {
  await addTask(await ctx(), { number: str(data, "number"), title: str(data, "title"), ownerName: opt(data, "ownerName"), due: opt(data, "due") });
  done();
}

export async function riskAction(data: FormData) {
  const number = str(data, "number");
  if (str(data, "riskId")) await setRiskStatus(await ctx(), { number, riskId: str(data, "riskId"), status: str(data, "status") as "closed" });
  else await addRisk(await ctx(), { number, kind: str(data, "kind") as "risk", title: str(data, "title"), impact: (opt(data, "impact") ?? "medium") as "high", ownerName: opt(data, "ownerName") });
  done();
}
