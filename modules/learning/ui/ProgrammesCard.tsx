"use client";

import { useState } from "react";
import { PinButton, Segmented } from "@amax/ui";
import { programmePin, viewPin } from "../pins";
import type { ProgrammeRow } from "../server/queries";

const FILTERS = { All: null, Running: "running", Done: "done" } as const;
type Filter = keyof typeof FILTERS;
const KIND: Record<string, string> = { certification: "Certification", workshop: "Workshop", compliance: "Compliance", leadership: "Leadership", course: "Course" };
const meter = (n: number) => (n >= 90 ? "var(--mint)" : n >= 50 ? "var(--violet)" : "var(--amber)");
const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const subtitle = (p: ProgrammeRow) => p.detail ?? (p.endsOn ? `${p.status === "done" ? "Ended" : "Ends"} ${shortDay(p.endsOn)}` : p.delivery === "internal" ? "Internal" : "External");

export function ProgrammesCard({ rows }: { rows: ProgrammeRow[] }) {
  const [filter, setFilter] = useState<Filter>("All");
  const shown = rows.filter((p) => !FILTERS[filter] || p.status === FILTERS[filter]);
  return (
    <div className="card flush pinnable">
      <div className="card-head">
        <h2>Programmes</h2><PinButton inline pin={viewPin("Programmes", "list_programmes")} />
        <Segmented label="Status" options={Object.keys(FILTERS)} value={filter} onChange={(v) => setFilter(v as Filter)} />
      </div>
      <div className="scroll-x"><table className="tbl">
        <caption className="sr">Programmes, most hours first</caption>
        <thead><tr><th>Programme</th><th>Type</th><th className="num">People</th><th style={{ minWidth: 160 }}>Completion</th><th className="num">Hours</th></tr></thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.id} className="pinnable">
              <td><b>{p.title}</b><small>{subtitle(p)}</small></td>
              <td><span className={p.kind === "certification" ? "chip agent" : "chip"}>{KIND[p.kind]}</span></td>
              <td className="num">{p.people}</td>
              <td><div className="row"><div className="meter" aria-hidden="true"><i style={{ width: `${p.completion}%`, background: meter(p.completion) }} /></div>{p.completion}%</div></td>
              <td className="num">{Math.round(p.hours).toLocaleString("en-US")}<PinButton pin={programmePin(p)} /></td>
            </tr>
          ))}
          {!shown.length && <tr><td colSpan={5} className="muted">No {filter.toLowerCase()} programmes.</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}
