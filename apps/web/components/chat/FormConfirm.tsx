"use client";

import { useRef, useState } from "react";
import type { CardForm as Form } from "@amax/core";
import type { Edits, FieldCheck } from "@amax/chat";
import { CardForm } from "./CardForm";
import { confirmLabel, edited, startValues, withValue, type Values } from "./form-values";

type Props = {
  form: Form; input: Record<string, unknown>; fallback: string; busy: boolean; note?: string; field?: string;
  onConfirm: (edits: Edits) => void; onEdit: () => void; onCancel: () => void; onCheck: (edits: Edits) => Promise<FieldCheck>;
};

export function FormConfirm({ form, input, fallback, busy, note, field, onConfirm, onEdit, onCancel, onCheck }: Props) {
  const [values, setValues] = useState<Values>(() => startValues(form, input));
  const [check, setCheck] = useState<FieldCheck | null>(note ? { field, message: note } : {});
  const [shown, setShown] = useState(note);
  const [checking, setChecking] = useState(false);
  if (note !== shown) {
    setShown(note);
    if (note) setCheck({ field, message: note });
  }
  const typed = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asked = useRef(0);

  function ask(next: Values) {
    if (timer.current) clearTimeout(timer.current);
    const n = ++asked.current;
    setChecking(true);
    timer.current = setTimeout(async () => {
      const result = await onCheck(edited(form, next)).catch(() => ({ message: "Couldn't check that just now." }));
      if (n === asked.current) { setCheck(result); setChecking(false); }
    }, 350);
  }

  function onValue(name: string, value: string) {
    typed.current.add(name);
    const next = withValue(form, values, typed.current, name, value);
    setValues(next);
    ask(next);
  }

  const blocked = busy || checking || Boolean(check?.message);
  return (
    <>
      <CardForm form={form} values={values} check={check} disabled={busy} onValue={onValue} />
      {busy ? <p className="muted">Working on it…</p> : (
        <div className="cc-acts">
          <button className="btn sm primary" type="button" disabled={blocked} onClick={() => onConfirm(edited(form, values))}>{confirmLabel(form, values, fallback)}</button>
          <button className="cc-quiet" type="button" onClick={onEdit}>Edit</button>
          <button className="cc-quiet" type="button" onClick={onCancel}>Cancel</button>
        </div>
      )}
    </>
  );
}
