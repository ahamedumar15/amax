"use client";

import { openChat, type PinRef } from "@amax/ui";

// Where a form would go (R3): opens chat with the record pinned and the prompt filled in; chat runs the write after its confirm.
export function AskButton({ label, prompt, pin, className = "btn sm", name, describedBy }: { label: string; prompt: string; pin: PinRef; className?: string; name?: string; describedBy?: string }) {
  return (
    <button type="button" className={className} data-ask={prompt} title={`Prompt: ${prompt}`} aria-label={name} aria-describedby={describedBy}
      onClick={() => openChat({ pin, prompt })}>
      {label}
    </button>
  );
}
