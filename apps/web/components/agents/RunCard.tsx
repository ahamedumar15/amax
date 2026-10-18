import type { SuggestionView } from "@amax/agents/server";
import type { RunView } from "@amax/workflows/server";
import { PinButton } from "@amax/ui";
import { runPinOf } from "./format";

const STATUS: Record<string, string> = { waiting: "Waiting for a person", completed: "Finished", failed: "Failed", running: "Running" };
const masked = (v: unknown) => typeof v === "object" && v !== null && (v as { masked?: boolean }).masked === true;

// 006 AC-4: the run behind a suggestion: what it read, what it produced, and what it cost, masked by class.
export function RunCard({ s, run }: { s: SuggestionView | null; run: RunView | null }) {
  if (!s || !run) return (
    <div className="card pinnable"><div className="card-head"><h2>Agent runs</h2><PinButton inline pin={{ label: "Agent jobs", tool: "list_agent_jobs", args: {} }} /></div>
      <p className="muted">Suggestions from an agent run show its input, tool calls, output and cost here. Recurring checks make theirs without a model.</p></div>
  );
  const think = run.steps.find((x) => x.name === "think");
  const calls = think && !masked(think.toolCalls) ? (think.toolCalls as { tool: string }[]) : [];
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>Run {run.id.slice(0, 4)}…</h2><span className={`chip ${run.status === "failed" ? "bad" : "good"}`}>{STATUS[run.status] ?? run.status}</span><PinButton inline pin={runPinOf(s)} /></div>
      <ol className="run-steps">
        <li>Input: {s.target.label}{s.actsFor ? `, acts for ${s.actsFor.name}` : ""}</li>
        {think && masked(think.toolCalls) ? <li>Tool calls hidden: they hold fields you may not see</li> : calls.map((c, i) => <li key={i}>Tool <code>{c.tool}</code>{c.tool === "propose_suggestion" ? " (its only output)" : " (read-only allow-list)"}</li>)}
        {run.status === "waiting" && <li>Waiting for the decision, no compute used</li>}
      </ol>
      {"costUsd" in run && <p className="src note">Model and API cost ${run.costUsd.toFixed(3)}.</p>}
    </div>
  );
}
