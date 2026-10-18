"use client";

import { useState } from "react";
import { PinButton, Segmented } from "@amax/ui";
import type { CareerKind } from "../contracts";
import { careerPin, eventPin } from "../pins";
import type { CareerScreen } from "../server/view";
import { TreeSvg } from "./TreeSvg";

const FILTERS: Record<string, CareerKind[]> = {
  Everything: ["joined", "grade", "move", "project", "certification", "technology"], Promotions: ["joined", "grade"], Projects: ["project"],
  Technologies: ["project", "technology"], Certifications: ["certification"], Moves: ["move"],
};

function Selected({ s, id }: { s: CareerScreen; id: string | null }) {
  const trace = id ? s.traces[id] : null;
  const row = s.rows.find((r) => r.id === id);
  return (
    <section className="card pinnable" aria-live="polite" aria-labelledby="career-selected">
      <div className="card-head"><h2 id="career-selected">Selected</h2>{row && <PinButton inline pin={eventPin(s.person, row)} />}</div>
      {!trace ? <p className="muted">Select something in the tree or the list to see who recorded it.</p> : <>
        <p className="what"><b>{trace.title}</b></p>
        <dl className="trace">
          {trace.lines.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          <div><dt>Source</dt><dd>{trace.source.href ? <a href={trace.source.href}>{trace.source.label}</a> : trace.source.label}{trace.source.ref ? ` · trace #${trace.source.ref.slice(0, 4)}…` : ""}</dd></div>
        </dl>
        <p className="muted foot">Pay is never shown here; a grade change shows the grade only.</p>
      </>}
    </section>
  );
}

export function Board({ s }: { s: CareerScreen }) {
  const [selected, setSelected] = useState(s.selected);
  const [filter, setFilter] = useState("Everything");
  const kinds = FILTERS[filter];
  return (
    <div className="board">
      <section className="card pinnable tree-card" aria-labelledby="career-tree">
        <PinButton pin={careerPin(s.person, "career tree")} />
        <div className="card-head"><h2 id="career-tree">Career tree</h2><Segmented label="Show" options={Object.keys(FILTERS)} value={filter} onChange={setFilter} /></div>
        <TreeSvg s={s} selected={selected} kinds={kinds} onSelect={setSelected} />
        <ul className="tkey" aria-label="Technology colours">{s.key.map((k) => <li key={k.name} className="chip"><i style={{ background: k.colour }} aria-hidden="true" />{k.name}</li>)}</ul>
        <p className="muted foot">Drawn to scale: one month is the same height everywhere. Branches run for exactly the time on the project, thicker for a larger allocation, and projects at the same time take parallel lanes. Rings are grades, diamonds certifications (grey when expired), faint leaves are technologies proposed by the agent.</p>
        {s.notes.map((n) => <p key={n} className="muted note">{n}</p>)}
      </section>
      <div className="cols even below">
        <Selected s={s} id={selected} />
        <section className="card changes" aria-labelledby="career-changes">
          <div className="card-head"><h2 id="career-changes">What changed</h2><span className="muted">Newest first</span></div>
          <ul className="list">
            {s.rows.filter((r) => kinds.includes(r.kind)).map((r) => (
              <li key={r.id} className="pinnable" aria-current={r.id === selected ? "true" : undefined}>
                <button type="button" className="pick" aria-label={`${r.title}, ${r.sub}`} onClick={() => setSelected(r.id)}><span>{r.id === selected ? <b>{r.title}</b> : r.title}<small>{r.sub}</small></span></button>
                {r.chip && <span className={`chip ${r.chip.tone}`}>{r.chip.label}</span>}
                <PinButton inline pin={eventPin(s.person, r)} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
