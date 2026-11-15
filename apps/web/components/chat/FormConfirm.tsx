"use client";

import { useRef, useState } from "react";
import type { CardForm as Form } from "@amax/core";
import type { Edits, FieldCheck } from "@amax/chat";
import { CardForm } from "./CardForm";
import { CHECK_FAILED } from "@amax/chat/field-check";
import { checkResultOf, confirmLabel, edited, refusalOf, startValues, withValue, type Values } from "./form-values";

type Props = {
  form: Form; input: Record<string, unknown>; fallback: string; busy: boolean; note?: string; field?: string;
  onConfirm: (edits: Edits) => void; onEdit: () => void; onCancel: () => void; onCheck: (edits: Edits) => Promise<FieldCheck>;
};

export function FormConfirm({ form, input, fallback, busy, note, field, onConfirm, onEdit, onCancel, onCheck }: Props) {
  const [values, setValues] = useState<Values>(() => startValues(form, input));
  const [check, setCheck] = useState<FieldCheck | null>(() => refusalOf(form, note, field).check);
  const [notice, setNotice] = useState(() => refusalOf(form, note, field).notice);
  const [shown, setShown] = useState(note);
  const [checking, setChecking] = useState(false);
  const typed = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asked = useRef(0);
  if (note !== shown) {
    setShown(note);
    const r = refusalOf(form, note, field);
    if (note) { setCheck(r.check); setNotice(r.notice); }
  }

  function ask(next: Values) {
    if (timer.current) clearTimeout(timer.current);
    const n = ++asked.current;
    setChecking(true);
    timer.current = setTimeout(async () => {
      const result = checkResultOf(await onCheck(edited(form, next)).catch(() => CHECK_FAILED));
      if (n === asked.current) { setCheck(result.check); setNotice(result.notice); setChecking(false); }
    }, 350);
  }

  function onValue(name: string, value: string) {
    typed.current.add(name);
    const next = withValue(form, values, typed.current, name, value);
    setValues(next);
    setNotice(undefined);
    ask(next);
  }

  const blocked = busy || checking || Boolean(check?.message);
  return (
    <>
      <CardForm form={form} values={values} check={check} checking={checking} notice={notice} disabled={busy} onValue={onValue} />
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
