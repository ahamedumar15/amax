"use client";

import { useRef, useState } from "react";
import { moveAction, removeAction } from "../actions";

const STAGES: [string, string][] = [["new-idea", "New idea"], ["lead", "Lead"], ["qualified", "Qualified"], ["proposal", "Proposal"], ["negotiation", "Negotiation"]];

// Choosing a stage does nothing until Move is pressed, so arrow keys in the select are safe.
export function MoveControls({ number, name, stage, canRemove }: { number: string; name: string; stage: string; canRemove: boolean }) {
  const [to, setTo] = useState(stage);
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <form action={moveAction} className="opp-act">
        <input type="hidden" name="number" value={number} />
        <select className="select sm" aria-label={`Move ${name} to stage`} name="to" value={to} onChange={(e) => setTo(e.target.value)}>
          {STAGES.map(([id, label]) => <option key={id} value={id}>{id === stage ? `${label} (now)` : `→ ${label}`}</option>)}
          <option value="won">→ Won</option>
        </select>
        <button className="btn sm" type="submit" disabled={to === stage} aria-label={`Move ${name}`}>Move</button>
        {canRemove && (
          <button className="btn sm ghost icon" type="button" aria-label={`Remove ${name}`} title="Remove" onClick={() => dialog.current?.showModal()}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>
          </button>
        )}
      </form>
      {canRemove && (
        <dialog className="small" ref={dialog} aria-label={`Remove ${name}`}>
          <div className="pal-body">
            <h2>Remove {name}?</h2>
            <p className="muted">Use this for duplicates or mistakes. To record a lost deal, mark it as lost instead so it counts in win rates.</p>
            <form action={removeAction} className="actions">
              <input type="hidden" name="number" value={number} />
              <button className="btn danger" type="submit">Remove</button>
              <button className="btn" type="button" onClick={() => dialog.current?.close()}>Keep it</button>
            </form>
          </div>
        </dialog>
      )}
    </>
  );
}
