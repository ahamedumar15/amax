import { metricPin } from "../pins";
import type { RunView } from "../server/queries";
import { AskButton } from "./AskButton";

/** The run's next step as an Ask amax button; disabled with the reason while it can't be taken (014 AC-2). */
export function NextStep({ run }: { run: RunView }) {
  const n = run.next;
  if (!n) return null;
  const hint = `next-hint-${run.id}`;
  return (
    <>
      {n.hint && <span className="muted hint" id={hint}>{n.hint}</span>}
      {n.enabled
        ? <AskButton className="btn primary" label={n.label} prompt={n.prompt} pin={metricPin(run, n.label)} describedBy={n.hint ? hint : undefined} />
        : <button type="button" className="btn primary" disabled aria-describedby={n.hint ? hint : undefined}>{n.label}</button>}
    </>
  );
}
