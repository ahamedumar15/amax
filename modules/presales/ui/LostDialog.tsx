"use client";

import { useRef } from "react";
import { lostAction } from "../actions";

export const LOST_REASONS = ["Price", "Lost to a competitor", "No budget", "Timing", "Scope did not fit"];

// Lost needs a reason; it moves to Closed and stays in the history, and reasons feed win-rate insights.
export function LostDialog({ number, title }: { number: string; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button className="btn" type="button" onClick={() => dialog.current?.showModal()}>Mark as lost</button>
      <dialog className="small" ref={dialog} aria-labelledby="lostTitle">
        <div className="pal-body">
          <h2 id="lostTitle">Mark {title} as lost?</h2>
          <p className="muted">It moves to Closed and stays in the history. Reasons feed the win-rate insights.</p>
          <form className="form" action={lostAction}>
            <input type="hidden" name="number" value={number} />
            <label>Reason<select className="select" name="reason" required defaultValue="Price">{LOST_REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
            <label>Competitor<input name="competitor" placeholder="Optional" maxLength={120} /></label>
            <div className="actions"><button className="btn danger" type="submit">Mark as lost</button><button className="btn" type="button" onClick={() => dialog.current?.close()}>Cancel</button></div>
          </form>
        </div>
      </dialog>
    </>
  );
}
