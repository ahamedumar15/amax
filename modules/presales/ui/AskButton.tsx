"use client";

import { openChat, type PinRef } from "@amax/ui";

export function AskButton({ label, prompt, pin, className = "btn sm", name }: { label: string; prompt: string; pin: PinRef; className?: string; name?: string }) {
  return (
    <button type="button" className={className} data-ask={prompt} title={`Prompt: ${prompt}`} aria-label={name}
      onClick={() => openChat({ pin, prompt })}>
      {label}
    </button>
  );
}
