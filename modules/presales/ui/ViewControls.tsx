"use client";

import { useEffect, useState } from "react";

// Board or list, and one owner or all: both only change what's shown, so they stay in the browser.
export function ViewControls({ owners }: { owners: string[] }) {
  const [view, setView] = useState<"board" | "list">("board");
  const [owner, setOwner] = useState("");
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".presales");
    if (!root) return;
    root.dataset.view = view;
    root.querySelectorAll<HTMLElement>("[data-owner]").forEach((el) => { el.hidden = Boolean(owner) && el.dataset.owner !== owner; });
  }, [view, owner]);
  return (
    <>
      <div className="seg" role="group" aria-label="View">
        <button type="button" aria-pressed={view === "board"} onClick={() => setView("board")}>Board</button>
        <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
      </div>
      <select className="select" aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
        <option value="">All owners</option>
        {owners.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </>
  );
}
