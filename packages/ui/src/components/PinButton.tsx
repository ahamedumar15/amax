"use client";

// "Add <name> to chat" (005 AC-4). Shown on hover, focus and touch; the chat fetches the record
// with the user's permissions through the named read tool.
export type PinRef = { label: string; tool: string; args: Record<string, unknown> };

export const openChat = (detail: { pin?: PinRef; intent?: string; prompt?: string }) => window.dispatchEvent(new CustomEvent("amax:chat", { detail }));

export function PinButton({ pin, inline }: { pin: PinRef; inline?: boolean }) {
  return (
    <button type="button" className={inline ? "pin inline" : "pin"} aria-label={`Add ${pin.label} to chat`} data-pin={JSON.stringify(pin)}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); openChat({ pin }); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </button>
  );
}

// A create button marked with a chat intent: opens the chat in that mode, no module form needed (AC-2).
export function IntentButton({ intent, label, primary = true }: { intent: string; label: string; primary?: boolean }) {
  return (
    <button type="button" className={primary ? "btn primary" : "btn"} data-intent={intent} onClick={() => openChat({ intent, prompt: label })}>
      <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 2 }}><path d="M12 5v14M5 12h14" /></svg>
      {label}
    </button>
  );
}
