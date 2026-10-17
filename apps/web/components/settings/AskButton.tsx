"use client";

import "./admin.css";
import { openChat, type PinRef } from "@amax/ui";

// "Ask amax" in place of a write form (047 AC-2): opens chat with the record pinned and the prompt
// filled in. The write runs only after chat's confirm card. `tool` names the write it leads to.
export function AskButton({ label, prompt, pin, tool, primary = false, small = !primary, name }: { label: string; prompt: string; pin: PinRef; tool: string; primary?: boolean; small?: boolean; name?: string }) {
  return (
    <button type="button" className={`btn${primary ? " primary" : ""}${small ? " sm" : ""} ask`} data-ask={prompt} data-tool={tool} aria-label={name} onClick={() => openChat({ pin, prompt })}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z" /></svg>
      {label}
    </button>
  );
}
