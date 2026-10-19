"use client";

import Link from "next/link";
import { useState } from "react";
import type { OverviewWaiting } from "@amax/core";
import { openChat, PinButton } from "@amax/ui";

const waited = (since: string, now: number) => {
  const h = Math.max(0, Math.round((now - new Date(since).getTime()) / 3_600_000));
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} d`;
};

const SHOWN = 6;

// 068 AC-3: decisions waiting on the viewer, oldest first. Every action opens chat with the record
// pinned and a prompt filled in; chat runs any write after the pending-action confirm (rule 1).
export function WaitingTable({ items: all, now }: { items: OverviewWaiting[]; now: number }) {
  const items = all.slice(0, SHOWN);
  const [picked, setPicked] = useState<string[]>([]);
  const chosen = items.filter((i) => picked.includes(i.id));
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
  const ask = (rows: OverviewWaiting[], prompt: string) => { for (const r of rows) openChat({ pin: r.pin }); openChat({ prompt }); };
  return (
    <div className="card flush waiting">
      <div className="card-head"><h2>Waiting on you</h2><div className="actions">
        <button type="button" className="btn primary" disabled={!chosen.length} onClick={() => ask(chosen, `Approve these ${chosen.length} decisions`)}>Approve selected</button>
      </div></div>
      {items.length ? (
        <div className="scroll-x"><table className="tbl">
          <thead><tr><th className="sel"><input type="checkbox" aria-label="Select all decisions" checked={chosen.length === items.length} onChange={(e) => setPicked(e.target.checked ? items.map((i) => i.id) : [])} /></th><th>Decision</th><th>Project</th><th>Raised by</th><th>Waiting</th><th className="num">Action</th></tr></thead>
          <tbody>{items.map((i) => (
            <tr key={i.id} className="pinnable">
              <td className="sel"><input type="checkbox" aria-label={`Select: ${i.title}`} checked={picked.includes(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} /></td>
              <td><b>{i.title}</b>{i.detail && <small>{i.detail}</small>}</td>
              <td>{i.context}</td>
              <td><span className={i.agent ? "chip agent" : "chip"}>{i.raisedBy}</span></td>
              <td><time dateTime={i.since}>{waited(i.since, now)}</time></td>
              <td className="num"><span className="when"><button type="button" className="btn sm" title="Ask amax" onClick={() => ask([i], i.prompt)}>{i.action}</button><PinButton pin={i.pin} /></span></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <p className="muted empty-line">Nothing is waiting on you.</p>}
      {all.length > SHOWN && <p className="muted empty-line">Oldest {SHOWN} of {all.length} shown. Ask amax for the rest, or open <Link href="/suggestions">Suggestions</Link>.</p>}
    </div>
  );
}
