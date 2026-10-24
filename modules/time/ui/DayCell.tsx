"use client";

import { useState } from "react";
import type { CellState } from "../server/grid";

// 073 AC-13/AC-17: a day's hours, its state as an icon and a word as well as a colour, and its projects on hover,
// focus or tap. The button is only a disclosure; it changes nothing.
const LOOK: Record<CellState, [string, string]> = {
  missing: ["✕", "Missing"], low: ["▲", "Low"], on_target: ["✓", "On target"], over: ["●", "Over"], not_yet: ["–", "Not yet"], leave: ["–", "On leave"], weekend: ["–", "Weekend"],
};

type Props = { who: string; dayLabel: string; hours: number; state: CellState; projects: { name: string; hours: number }[] };

export function DayCell({ who, dayLabel, hours, state, projects }: Props) {
  const [open, setOpen] = useState(false);
  const [icon, word] = LOOK[state];
  const shown = hours ? hours.toFixed(1) : state === "leave" ? "leave" : "–";
  const detail = projects.length ? projects.map((p) => `${p.name} ${p.hours.toFixed(1)} h`).join(", ") : "nothing logged";
  return (
    <span className="cellwrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className={`cell ${state}`} aria-expanded={open} aria-label={`${who}, ${dayLabel}: ${hours.toFixed(1)} h, ${word.toLowerCase()}. ${detail}`}
        onClick={() => setOpen((o) => !o)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
        <span aria-hidden="true" className="glyph">{icon}</span> {shown}
      </button>
      {open && <span role="tooltip" className="pop"><b>{who}, {dayLabel}</b>{projects.length ? projects.map((p) => <span key={p.name}>{p.name}: {p.hours.toFixed(1)} h</span>) : <span>Nothing logged</span>}<small>{word}</small></span>}
    </span>
  );
}
