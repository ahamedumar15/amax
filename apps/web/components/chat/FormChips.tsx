"use client";

import { useId } from "react";
import type { CardField } from "@amax/core";

type Chips = Extract<CardField, { kind: "chips" }>;
type Props = { field: Chips; value: string; error?: string; disabled: boolean; onChange: (value: string) => void };

export function FormChips({ field, value, error, disabled, onChange }: Props) {
  const id = useId();
  const listed = field.options.some((o) => o.value === value);
  const other = Boolean(field.other) && !listed && value !== "";
  return (
    <fieldset className="cf-chips" aria-describedby={error ? `${id}-err` : undefined} disabled={disabled}>
      <legend>{field.label}</legend>
      {field.options.map((o) => (
        <label key={o.value} className={o.value === value ? "chip on" : "chip"}>
          <input type="radio" name={id} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />{o.label}
        </label>
      ))}
      {field.other && (
        <label className={other ? "chip on" : "chip"}>
          <input type="radio" name={id} value="" checked={other} onChange={() => onChange(" ")} />{field.other}
        </label>
      )}
      {other && <input className="cf-text" aria-label={`${field.label}: ${field.other}`} value={value.trim()} onChange={(e) => onChange(e.target.value || " ")} />}
      {error && <p className="err" id={`${id}-err`}>{error}</p>}
    </fieldset>
  );
}
