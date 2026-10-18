"use client";

import { FILTERS } from "../server/filters";

// A read-only filter (R3). The value is looked up in the known list and encoded, never put into the URL raw.
export function PeopleFilter({ at }: { at: string }) {
  return (
    <select className="select" aria-label="Show" value={at} onChange={(e) => {
      const id = FILTERS.find((f) => f.id === e.target.value)?.id;
      window.location.assign(id && id !== "everyone" ? `/it-access?people=${encodeURIComponent(id)}#people` : "/it-access#people");
    }}>
      {FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
    </select>
  );
}
