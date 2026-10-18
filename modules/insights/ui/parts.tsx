import type { ReactNode } from "react";
import type { InsightSource } from "../contracts";
import { shortDay } from "../server/days";

const listed = (xs: ReactNode[]) => xs.flatMap((x, i) => (i === 0 ? [x] : [i === xs.length - 1 ? " and " : ", ", x]));

/** AC-1: what an insight rests on, each source linked to its evidence, with its confidence and date. */
export function Src({ sources, confidence, asOf, tail }: { sources: InsightSource[]; confidence?: string; asOf?: string; tail?: string }) {
  return (
    <small className="src">
      From {listed(sources.map((s) => <a key={`${s.label}${s.evidenceRef}`} href={s.evidenceRef}>{s.label}</a>))}
      {confidence && `; ${confidence} confidence`}{asOf && `; ${shortDay(asOf)}`}{tail && `. ${tail}`}
    </small>
  );
}

export function ExportLink({ filename, csv, label }: { filename: string; csv: string; label: string }) {
  return (
    <a className="btn" download={filename} href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-4-4 4 4 4-4M5 20h14" /></svg>{label}<span className="sr"> as CSV</span>
    </a>
  );
}

/** A stat in a card's split row, pinned to what it shows. */
export function Stat({ k, value, note, pin }: { k: string; value: string; note: ReactNode; pin: ReactNode }) {
  return <div className="pinnable"><div className="k">{k}</div><div className="big">{value}</div>{note}{pin}</div>;
}

export const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
