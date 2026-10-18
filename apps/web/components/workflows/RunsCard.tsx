import type { Masked as MaskedValue, RunView, StepView } from "@amax/workflows/server";
import { EmptyState, Masked, PinButton } from "@amax/ui";
import { AskButton } from "../settings/AskButton";

const TONE: Record<string, string> = { completed: "good", failed: "bad", cancelled: "draft", paused: "warn", waiting: "agent", sleeping: "info", running: "info" };
const ACTIONS: Record<string, ("pause" | "resume" | "cancel" | "retry")[]> = { running: ["pause", "cancel"], sleeping: ["pause", "cancel"], waiting: ["pause", "cancel"], paused: ["resume", "cancel"], failed: ["retry"] };
const isMasked = (v: unknown): v is MaskedValue => typeof v === "object" && v !== null && (v as MaskedValue).masked === true;
const pinOf = (r: RunView) => ({ label: `${r.title} run ${r.id.slice(0, 8)}`, tool: "get_workflow_run", args: { runId: r.id } });
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

function stepLine(s: StepView) {
  if (s.kind === "sleep") return s.status === "done" ? "slept" : `sleeping until ${s.fireAt ? new Date(s.fireAt).toISOString().slice(0, 16).replace("T", " ") : "?"} UTC`;
  if (s.kind === "wait") return s.status === "done" ? "event received" : `waiting for ${s.waitEvent}`;
  const tries = s.attempts > 1 ? `, ${s.attempts} tries` : "";
  const error = isMasked(s.error) ? ": ••••" : s.error && s.status !== "done" ? `: ${s.error}` : "";
  return `${s.status}${tries}${error}`;
}

function Value({ v }: { v: unknown }) {
  if (isMasked(v)) return <Masked masked />;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return <>{Object.entries(v).map(([k, x]) => <span key={k} style={{ marginRight: 10 }}>{k}: {isMasked(x) ? <Masked masked /> : JSON.stringify(x)}</span>)}</>;
  }
  return <>{JSON.stringify(v)}</>;
}

// 055: without the pricing class (`priced` false) the Cost column goes.
export function RunsCard({ runs, priced = true }: { runs: RunView[]; priced?: boolean }) {
  return (
    <div className="card flush pinnable" style={{ marginTop: 28 }}>
      <div className="card-head"><h2>Runs</h2><PinButton inline pin={{ label: "Workflow runs", tool: "list_workflow_runs", args: {} }} /><span className="muted" style={{ fontSize: 13 }}>Latest {runs.length}</span></div>
      {runs.length === 0 ? (
        <EmptyState icon="spark" title="No runs yet" hint="Agent tasks and scheduled jobs show here with every step they take." />
      ) : (
        <div className="scroll-x">
          <table className="tbl">
            <caption className="sr">Workflow runs</caption>
            <thead><tr><th>Run</th><th>Status</th><th>Steps</th><th>Acts for</th>{priced && <th className="num">Cost</th>}<th className="num"><span className="sr">Ask</span></th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="pinnable">
                  <td data-label="Run"><b>{r.title}</b>{r.input !== null && <small>Input: <Value v={r.input} /></small>}{r.output !== null && <small>Output: <Value v={r.output} /></small>}</td>
                  <td data-label="Status"><span className={`chip ${TONE[r.status] ?? ""}`}>{r.status}</span>{r.error && <small>{isMasked(r.error) ? <Masked masked /> : r.error}</small>}</td>
                  <td data-label="Steps"><ol style={{ margin: 0, paddingLeft: 18 }}>{r.steps.map((s) => <li key={s.name}><b>{s.name}</b> {stepLine(s)}{Array.isArray(s.toolCalls) && s.toolCalls.length > 0 && <small>Tools: {s.toolCalls.map((t) => t.tool).join(", ")}</small>}</li>)}</ol></td>
                  <td data-label="Acts for">{r.actsFor ?? <span className="muted">{r.startedBy}</span>}</td>
                  {priced && <td data-label="Cost" className="num">{usd(r.costUsd)}</td>}
                  <td className="num">
                    <div className="ask-row">
                      {(ACTIONS[r.status] ?? []).map((a) => {
                        const verb = `${a[0].toUpperCase()}${a.slice(1)}`;
                        return <AskButton key={a} label={`Ask to ${a}`} prompt={`${verb} this run of ${r.title}`} pin={pinOf(r)} tool="control_workflow_run" name={`Ask to ${a} ${r.title}`} />;
                      })}
                    </div>
                    <PinButton pin={pinOf(r)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
