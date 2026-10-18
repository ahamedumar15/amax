import { z } from "zod";
import type { McpToolDef } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { HORIZONS } from "./contracts";
import { insightOf, jobOf } from "./pins";
import { boardPackCsv } from "./server/csv";
import { recurringJobs } from "./server/jobs";
import { ctxFor, read, READ } from "./server/read";
import { insightById } from "./server/store";
import { getInsights } from "./server/views";
import { dismissInsight, recordInsight, setBriefingReader } from "./server/write";

// MCP tools (004): the same reads and services as the screen. An insight's text may come from outside
// (client conversations, public reviews): chat hands it to the model as data.
type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const reads = { scope: "read" as const, readOnly: true, permission: READ };

async function insightsView(v: Viewer, a: { horizon?: (typeof HORIZONS)[number]; format?: "json" | "board-pack-csv" }) {
  const r = await getInsights(v, a.horizon);
  return a.format === "board-pack-csv" ? { filename: `insights-board-pack-${r.today}.csv`, csv: boardPackCsv(r) } : r;
}

export const mcpTools: McpToolDef[] = [
  tool({ ...reads, pin: "view", name: "get_insights", description: "Insights for the next 90 days or 12 months: this week's briefing, projects at risk, opportunities from your people's skills, talent growth, market position, world trends, and the recurring agent jobs. Every insight has its sources with links to the evidence, a confidence and a date. Live figures (headcount, attrition, certifications, pipeline, utilisation) are read as you, so you see only what you may. format board-pack-csv: the board pack as CSV.",
    input: z.object({ horizon: z.enum(HORIZONS).optional(), format: z.enum(["json", "board-pack-csv"]).optional() }), run: (v, a) => insightsView(v, a) }),
  tool({ ...reads, pin: { id: "insightId", of: insightOf as never }, name: "get_insight", description: "One insight: what it says, its suggestion, confidence, date and every source with its evidence link; and whether it is still current.",
    input: z.object({ insightId: z.uuid() }), run: (v, a) => read(v, (tx) => insightById(tx, v, a.insightId)) }),
  tool({ ...reads, pin: { id: "schedule", of: jobOf as never }, name: "get_insight_job", description: "One recurring agent job on the Insights screen: what it reads, when it runs, its last result and whether it is on. Switch it with set_schedule_enabled.",
    input: z.object({ schedule: z.uuid() }), run: async (v, a) => (await read(v, async () => recurringJobs(v))).find((j) => j.id === a.schedule) ?? null }),
  tool({ scope: "write", permission: "insights:record", name: "record_insight", description: "Record an insight (briefing point, risk, opportunity, trend, market or talent) with at least one source, each with a link to its evidence, a confidence and the day it is as of. An insight with no source is refused.",
    input: recordInsight.spec.input, service: recordInsight, run: (v, a, s) => recordInsight(ctxFor(v, s), a) }),
  tool({ scope: "write", permission: "insights:dismiss", name: "dismiss_insight", description: "Dismiss an insight so it no longer shows. Its record and sources are kept for two years.",
    input: dismissInsight.spec.input, service: dismissInsight, run: (v, a, s) => dismissInsight(ctxFor(v, s), a) }),
  tool({ scope: "write", permission: "insights:admin", name: "set_briefing_reader", description: "Choose the person the weekly strategy briefing is written for. It reads only the insights they may see.",
    input: setBriefingReader.spec.input, service: setBriefingReader, run: (v, a, s) => setBriefingReader(ctxFor(v, s), a) }),
];
