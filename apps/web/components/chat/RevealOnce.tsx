"use client";

import { useId, useState } from "react";
import { announce } from "@amax/ui";
import type { Reveal } from "../../lib/chat-outcome";

export function RevealOnce({ reveal, onDone }: { reveal: Reveal; onDone: () => void }) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(reveal.value);
      setCopied(true);
      announce(`${reveal.label} copied`);
    } catch {
      announce("Copy didn't work; select the text and copy it yourself");
    }
  }
  return (
    <div className="reveal" role="group" aria-labelledby={id} style={{ marginTop: 10, display: "grid", gap: 8 }}>
      <b id={id} style={{ fontSize: 13.5 }}>{reveal.label}, shown once</b>
      <code data-testid="reveal-once" style={{ wordBreak: "break-all", padding: "8px 10px", borderRadius: 10, border: "1.5px solid var(--line-2)", background: "var(--card)", fontSize: 13, userSelect: "all" }}>{reveal.value}</code>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>amax keeps only a hash. It never went to the AI or the chat history, and it can't be shown again.</p>
      <div className="acts">
        <button className="btn sm primary" type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
        <button className="btn sm" type="button" onClick={onDone}>I've saved it</button>
      </div>
    </div>
  );
}
