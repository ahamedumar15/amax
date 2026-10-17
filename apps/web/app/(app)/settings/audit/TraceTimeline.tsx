import type { ChainResult, TraceStepView } from "@amax/core/server";
import { PinButton } from "@amax/ui";
import { shortTrace, stepText, time, type Names } from "./format";

export function TraceTimeline({ traceId, steps, intact, names }: { traceId: string; steps: TraceStepView[]; intact: ChainResult[]; names: Names }) {
  const ok = intact.every((c) => c.ok);
  return (
    <section className="card pinnable" style={{ marginTop: 28 }} aria-labelledby="trace-h">
      <div className="card-head">
        <h2 id="trace-h">Trace {shortTrace(traceId)}</h2>
        <PinButton inline pin={{ label: `Trace ${shortTrace(traceId)}`, tool: "get_trace", args: { traceId } }} />
        <span className={`chip ${ok ? "good" : "bad"}`}>{ok ? "Chain intact" : "Chain broken"}</span>
      </div>
      {steps.length === 0 ? <p className="muted">No steps are recorded for this trace.</p> : (
        <ol className="trace-steps">
          {steps.map((s) => (
            <li key={`${s.chain}-${s.seq}`} className="pinnable">
              <time dateTime={s.at}>{time(s.at)}</time> · {stepText(s, names)}
              <PinButton pin={{ label: `${s.chain === "audit" ? "Audit" : "Trace"} event ${s.seq}`, tool: "search_audit", args: { chain: s.chain, seq: s.seq } }} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
