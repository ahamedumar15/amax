"use client";

import { openChat, type PinRef } from "@amax/ui";

type Props = { label: string; prompt: string; pin: PinRef; className?: string; name?: string; spark?: boolean; disabled?: boolean };

export function AskButton({ label, prompt, pin, className = "btn sm", name, spark, disabled }: Props) {
  return (
    <button type="button" className={className} data-ask={prompt} title={`Prompt: ${prompt}`} aria-label={name} disabled={disabled} onClick={() => openChat({ pin, prompt })}>
      {spark && <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 14, height: 14, fill: "currentColor", stroke: "none" }}><path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z" /></svg>}
      {label}
    </button>
  );
}
