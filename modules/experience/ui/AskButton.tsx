"use client";

import { openChat, type PinRef } from "@amax/ui";

// Where a form would go (R3): opens chat with the record pinned and the prompt filled in. With
// `intent`, chat opens in that module's mode (a hardware fix becomes a ticket through helpdesk's).
type Props = { label: string; prompt: string; pin: PinRef; intent?: string; className?: string; name?: string };

export function AskButton({ label, prompt, pin, intent, className = "btn sm", name }: Props) {
  return (
    <button type="button" className={className} data-ask={prompt} data-intent={intent} title={`Prompt: ${prompt}`} aria-label={name} onClick={() => openChat({ pin, prompt, intent })}>
      {label}
    </button>
  );
}
