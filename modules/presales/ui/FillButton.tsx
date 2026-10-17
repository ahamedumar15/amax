"use client";

import { openChat } from "@amax/ui";

// "Fill with amax" and "Open in chat": the chat opens in new-opportunity mode (005 intents).
export function FillButton({ label, prompt, className = "btn primary", spark = true }: { label: string; prompt?: string; className?: string; spark?: boolean }) {
  return (
    <button type="button" className={className} data-intent="presales.new-opportunity" onClick={() => openChat({ intent: "presales.new-opportunity", prompt: prompt ?? "New opportunity" })}>
      {spark && <svg viewBox="0 0 24 24" aria-hidden="true" className="spark"><path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z" /></svg>}
      {label}
    </button>
  );
}
