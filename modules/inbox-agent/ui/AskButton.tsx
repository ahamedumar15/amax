"use client";

import { openChat, type PinRef } from "@amax/ui";

// Where a form would go (R3): opens chat with the find pinned and the prompt filled in. With `intent`,
// chat opens in that module's mode (025 AC-2: a find is added through its owner's chat intent).
type Props = { label: string; prompt: string; pin: PinRef; intent?: string | null; className?: string; name?: string };

export function AskButton({ label, prompt, pin, intent, className = "btn sm", name }: Props) {
  return (
    <button type="button" className={className} data-ask={prompt} data-intent={intent ?? undefined} title={`Prompt: ${prompt}`} aria-label={name}
      onClick={() => openChat({ pin, prompt, intent: intent ?? undefined })}>
      {label}
    </button>
  );
}
