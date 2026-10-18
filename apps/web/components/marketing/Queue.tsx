"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { QUEUES, ROLES, type Role } from "./queues";

export function Queue() {
  const [role, setRole] = useState<Role>("PM");
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [said, setSaid] = useState("");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const pick = (i: number) => {
    const next = ROLES[(i + ROLES.length) % ROLES.length];
    setRole(next);
    tabs.current[ROLES.indexOf(next)]?.focus();
  };
  const keys = (e: KeyboardEvent) => {
    const i = ROLES.indexOf(role);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ROLES.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    pick(to);
  };
  return (
    <div className="queue" data-ui aria-labelledby="q-title">
      <div className="q-top">
        <b id="q-title">Waiting on you</b>
        <div className="tabs" role="tablist" aria-label="View as" onKeyDown={keys}>
          {ROLES.map((r, i) => (
            <button key={r} ref={(el) => { tabs.current[i] = el; }} role="tab" id={`q-tab-${r}`} aria-controls="q-panel" aria-selected={r === role} tabIndex={r === role ? 0 : -1} onClick={() => setRole(r)}>{r}</button>
          ))}
        </div>
      </div>
      <div id="q-panel" role="tabpanel" aria-labelledby={`q-tab-${role}`}>
      <ul>
        {QUEUES[role].map((c) => (
          <li key={c.id} className={done[c.id] ? "qcard done" : "qcard"}>
            <span className={`ic ${c.tone}`} aria-hidden="true">{c.mark}</span>
            <div>
              <div className="t">{c.title}</div>
              <div className="d">{c.detail}</div>
              <span className="who">{c.by}</span>
              {done[c.id] && <div className="ok">✓ {c.done}</div>}
            </div>
            {!done[c.id] && <button className="go" onClick={() => { setDone({ ...done, [c.id]: true }); setSaid(c.done); }}>{c.action}</button>}
          </li>
        ))}
      </ul>
      </div>
      <p className="q-foot">Fictional data from Lumen Labs. Each decision is attributed and audited. Try Finance, HR or Engineer.</p>
      <p className="sr" role="status" aria-live="polite">{said}</p>
    </div>
  );
}
