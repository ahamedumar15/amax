"use client";

import { openChat, type PinRef } from "@amax/ui";

// The mock's on/off switch for a recurring job (AC-3). Flipping it asks amax: chat proposes
// set_schedule_enabled and the job changes only after its confirm, so the switch shows the job as it is.
export function Switch({ on, title, pin }: { on: boolean; title: string; pin: PinRef }) {
  const prompt = `${on ? "Pause" : "Resume"} the ${title} schedule`;
  return (
    <button type="button" role="switch" className="switch" aria-checked={on} aria-label={`${title}, ask amax to switch it ${on ? "off" : "on"}`}
      data-ask={prompt} title={`Prompt: ${prompt}`} onClick={() => openChat({ pin, prompt })} />
  );
}
