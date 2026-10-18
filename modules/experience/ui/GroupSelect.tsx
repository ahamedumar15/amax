"use client";

import type { Dimension } from "../contracts";

const LABEL: Record<Dimension, string> = { department: "Department", site: "Site", model: "Device model" };

const DIMENSIONS = Object.keys(LABEL) as Dimension[];

// A read-only control: it changes the grouping (?by=), never a record. Only a known dimension reaches the URL.
function go(picked: string) {
  const d = DIMENSIONS.find((k) => k === picked);
  if (d) window.location.assign(d === "department" ? "/experience" : `/experience?by=${encodeURIComponent(d)}`);
}

export function GroupSelect({ value }: { value: Dimension }) {
  return (
    <select className="select" aria-label="Group by" value={value} onChange={(e) => go(e.target.value)}>
      {DIMENSIONS.map((d) => <option key={d} value={d}>{LABEL[d]}</option>)}
    </select>
  );
}
