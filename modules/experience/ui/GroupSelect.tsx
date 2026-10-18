"use client";

import type { Dimension } from "../contracts";

const LABEL: Record<Dimension, string> = { department: "Department", site: "Site", model: "Device model" };

// A read-only control: it changes the grouping (?by=), never a record.
export function GroupSelect({ value }: { value: Dimension }) {
  return (
    <select className="select" aria-label="Group by" value={value} onChange={(e) => window.location.assign(`/experience${e.target.value === "department" ? "" : `?by=${e.target.value}`}`)}>
      {(Object.keys(LABEL) as Dimension[]).map((d) => <option key={d} value={d}>{LABEL[d]}</option>)}
    </select>
  );
}
