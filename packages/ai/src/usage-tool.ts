import { z } from "zod";
import { getRuntime } from "@amax/core/server";
import { rolesOf, type Viewer } from "@amax/auth";
import { aiUsage, USAGE_SOURCES, type AiUsage, type UsageSource } from "./usage";

type Group = "person" | "day" | "conversation";
/** Each row's pin key: the person ("none" for jobs), the UTC day, or the conversation. */
const rowsOf = (u: AiUsage, g: Group): { key: string }[] =>
  g === "person" ? u.byPerson.map((r) => ({ key: r.userId ?? "none", ...r }))
    : g === "day" ? u.byDay.map((r) => ({ key: r.day, ...r }))
      : u.byConversation.map((r) => ({ key: r.conversationId, ...r }));

export const usageInput = z.object({
  scope: z.enum(["self", "tenant"]).default("self"),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  source: z.enum(Object.keys(USAGE_SOURCES) as [UsageSource, ...UsageSource[]]).optional(),
  groupBy: z.enum(["person", "day", "conversation"]).optional(),
  key: z.string().max(64).optional(),
}).strict();
export type UsageInput = z.infer<typeof usageInput>;

/** The tool's answer: totals, plus one grouping (or all three), optionally narrowed to one row by `key`. */
export function shapeUsage(u: AiUsage, input: Pick<UsageInput, "groupBy" | "key">) {
  const base = { scope: u.scope, month: u.month, source: u.source, totals: u.totals, bySource: u.bySource };
  if (!input.groupBy) return { ...base, byDay: u.byDay, byPerson: u.byPerson, byConversation: u.byConversation };
  const rows = rowsOf(u, input.groupBy);
  return { ...base, groupBy: input.groupBy, rows: input.key ? rows.filter((r) => r.key === input.key) : rows };
}

export const getAiUsageTool = {
  name: "get_ai_usage",
  description: "AI cost, tokens and calls for a month. scope self is your own usage; tenant (Admin only) is everyone's. Group by person, day or conversation. A call with no known price is counted as unknown cost, never as $0.",
  input: usageInput,
  permission: "",
  scope: "read" as const,
  readOnly: true,
  pin: "view" as const,
  run: async (viewer: Viewer, input: UsageInput) =>
    shapeUsage(await aiUsage(getRuntime().db, { tenantId: viewer.tenantId, userId: viewer.userId, roles: rolesOf(viewer) }, input), input),
};

/** Registers get_ai_usage with the tool registry beside the modules' tools. */
export const aiTools = { id: "ai", mcpTools: [getAiUsageTool] };
