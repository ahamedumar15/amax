"use client";

type SegmentedProps = { label: string; options: string[]; value: string; onChange: (value: string) => void };

export function Segmented({ label, options, value, onChange }: SegmentedProps) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={o === value} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
}
