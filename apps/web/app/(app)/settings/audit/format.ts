import type { AuditEntry, ChainResult, TraceStepView } from "@amax/core/server";

export type Names = Map<string, string>;

export const time = (iso: string) => iso.slice(11, 19);
export const shortTrace = (id: string) => `t-${id.slice(0, 4)}…`;
export const count = (n: number) => n.toLocaleString("en-US");

export function ago(iso: string, now = Date.now()) {
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export function who(id: string | null, names: Names) {
  if (!id) return "Erased";
  const [kind, rest] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
  if (kind === "user") return names.get(rest) ?? "Unknown person";
  if (kind === "client") return "MCP client";
  if (kind === "job") return `Job ${rest}`;
  if (kind === "sp") return "Service principal";
  return id;
}

export function byLine(e: Pick<AuditEntry, "onBehalfOf" | "source">, names: Names) {
  if (e.onBehalfOf) return `for ${who(e.onBehalfOf, names)}`;
  return e.source === "chat" ? "via amax chat" : e.source === "mcp" ? "via MCP" : e.source === "job" ? "scheduled" : null;
}

export function chainNote(c: ChainResult, verifiedAt: string) {
  return c.ok ? `To event ${count(c.length)} · ${ago(verifiedAt)}` : `Chain broken at event ${count(c.brokenAt)} (${c.reason})`;
}

const decision = (s: TraceStepView) => (s.detail.decision === "cancelled" ? "Cancelled" : "Confirmed");
const refused = (s: TraceStepView) => (s.detail.outcome === "denied" ? ", refused by a permission check" : s.detail.outcome === "error" ? ", failed" : "");

export function stepText(s: TraceStepView, names: Names) {
  if (s.chain === "audit") return `Service write ${s.record ?? ""}, audited as ${s.what}`;
  switch (s.what) {
    case "turn": return `Prompt received from ${who(s.actor, names)}, ${s.detail.pins ?? 0} pin${s.detail.pins === 1 ? "" : "s"}`;
    case "model_call": return `Model call, ${s.model ?? s.detail.model ?? "unknown model"}${s.tokens !== null ? `, ${count(s.tokens)} tokens` : ""}${s.costUsd !== null ? `, $${s.costUsd.toFixed(3)}` : ""}`;
    case "tool_call": return `${s.detail.scope === "write" ? "Write" : "Read"} tool ${s.tool}${refused(s)}`;
    case "pending": return `Pending write ${s.tool} created`;
    case "decided": return `${decision(s)} by ${who(s.actor, names)}`;
    case "mcp_call": return `MCP call ${s.tool} from ${who(s.actor, names)}`;
    case "job_run": return `Job ${s.tool} started`;
    default: return s.what;
  }
}
