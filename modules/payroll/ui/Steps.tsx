import { PinButton } from "@amax/ui";
import { metricPin } from "../pins";
import type { RunView } from "../server/queries";
import { day } from "./parts";

const note = (s: RunView["steps"][number]) => (s.state === "done" ? `${s.by ?? "Done"}${s.at ? `, ${day(s.at)}` : ""}` : s.state === "now" ? "Next" : "");

// 014 AC-1: Draft → Agent check → HR approval → Finance approval → Bank file → Payslips sent. Each step pins its run.
export function Steps({ run }: { run: RunView }) {
  return (
    <div className="card pinnable steps-card">
      <PinButton pin={metricPin(run, "Run steps")} />
      <h2 className="sr">Run steps</h2>
      <ol className="steps">
        {run.steps.map((s) => (
          <li key={s.key} className={`pinnable ${s.state === "todo" ? "" : s.state}`} aria-current={s.state === "now" ? "step" : undefined}>
            {s.label}<small>{note(s)}</small>
            <PinButton inline pin={metricPin(run, s.label)} />
          </li>
        ))}
      </ol>
    </div>
  );
}
