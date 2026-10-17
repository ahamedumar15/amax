import type { Masked as MaskedValue, RunView, StepView } from "@amax/workflows/server";
import { EmptyState, Masked } from "@amax/ui";

type Props = { runs: RunView[]; control: (data: FormData) => Promise<void> };

const TONE: Record<string, string> = { completed: "good", failed: "bad", cancelled: "draft", paused: "warn", waiting: "agent", sleeping: "info", running: "info" };
const ACTIONS: Record<string, ("pause" | "resume" | "cancel" | "retry")[]> = { running: ["pause", "cancel"], sleeping: ["pause", "cancel"], waiting: ["pause", "cancel"], paused: ["resume", "cancel"], failed: ["retry"] };
const isMasked = (v: unknown): v is MaskedValue => typeof v === "object" && v !== null && (v as MaskedValue).masked === true;
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

function stepLine(s: StepView) {
  if (s.kind === "sleep") return s.status === "done" ? "slept" : `sleeping until ${s.fireAt ? new Date(s.fireAt).toISOString().slice(0, 16).replace("T", " ") : "?"} UTC`;
  if (s.kind === "wait") return s.status === "done" ? "event received" : `waiting for ${s.waitEvent}`;
  const tries = s.attempts > 1 ? `, ${s.attempts} tries` : "";
  return `${s.status}${tries}${s.error && s.status !== "done" ? `: ${s.error}` : ""}`;
}

function Value({ v }: { v: unknown }) {
  if (isMasked(v)) return <Masked masked />;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return <>{Object.entries(v).map(([k, x]) => <span key={k} style={{ marginRight: 10 }}>{k}: {isMasked(x) ? <Masked masked /> : JSON.stringify(x)}</span>)}</>;
  }
  return <>{JSON.stringify(v)}</>;
}

// The admin Runs list: each run's steps, waits and retries, who it acts for, its cost, and controls.
export function RunsCard({ runs, control }: Props) {
  return (
    <div className="card flush" style={{ marginTop: 28 }}>
      <div className="card-head"><h2>Runs</h2><span className="muted" style={{ fontSize: 13 }}>Latest {runs.length}</span></div>
      {runs.length === 0 ? (
        <EmptyState icon="spark" title="No runs yet" hint="Agent tasks and scheduled jobs show here with every step they take." />
      ) : (
        <div className="scroll-x">
          <table className="tbl">
            <caption className="sr">Workflow runs</caption>
            <thead><tr><th>Run</th><th>Status</th><th>Steps</th><th>Acts for</th><th className="num">Cost</th><th>Actions</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td data-label="Run"><b>{r.title}</b>{r.input !== null && <small>Input: <Value v={r.input} /></small>}{r.output !== null && <small>Output: <Value v={r.output} /></small>}</td>
                  <td data-label="Status"><span className={`chip ${TONE[r.status] ?? ""}`}>{r.status}</span>{r.error && <small>{r.error}</small>}</td>
                  <td data-label="Steps"><ol style={{ margin: 0, paddingLeft: 18 }}>{r.steps.map((s) => <li key={s.name}><b>{s.name}</b> {stepLine(s)}{Array.isArray(s.toolCalls) && s.toolCalls.length > 0 && <small>Tools: {s.toolCalls.map((t) => t.tool).join(", ")}</small>}</li>)}</ol></td>
                  <td data-label="Acts for">{r.actsFor ?? <span className="muted">{r.startedBy}</span>}</td>
                  <td data-label="Cost" className="num">{usd(r.costUsd)}</td>
                  <td data-label="Actions">
                    <div className="actions">
                      {(ACTIONS[r.status] ?? []).map((a) => (
                        <form key={a} action={control}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="action" value={a} />
                          <button type="submit" className="btn sm" aria-label={`${a[0].toUpperCase()}${a.slice(1)} ${r.title}`}>{a[0].toUpperCase() + a.slice(1)}</button>
                        </form>
                      ))}
                    </div>
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
