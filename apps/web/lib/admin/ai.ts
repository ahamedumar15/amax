import { z } from "zod";
import { aiStats, policyPatch, setAiPolicy } from "@amax/ai/admin";
import { ctxFor, read, tool, write, type AdminDeps } from "./tool";

const PERM = "ai:policy:manage";

export const aiTools = (d: AdminDeps) => [
  tool({ ...read(PERM), pin: "view", name: "get_ai_policy", description: "The AI and data policy: data region, provider region, which classified fields may be sent, voice, and this month's calls, cost and redactions.",
    input: z.object({}), run: (v) => aiStats(d.db(), v.tenantId) }),
  tool({ ...write(PERM), name: "set_ai_policy", description: "Change the AI and data policy. Only the fields given change. Regions are codes such as AU or LK; null clears one.",
    input: policyPatch, run: (v, a, s) => setAiPolicy(ctxFor(v, s), a) }),
];
