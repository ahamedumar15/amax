"use client";
import { useState } from "react";

// 116: copies a card line's value (the GitHub app's callback URL) and says so to screen readers.
export function CopyValue({ value, label }: { value: string; label: string }) {
  const [said, say] = useState("");
  const copy = () => navigator.clipboard.writeText(value).then(() => say("Copied"), () => say("Couldn't copy; select the text instead"));
  return (
    <>
      <button type="button" className="cc-quiet" onClick={copy} aria-label={`Copy ${label}`}>Copy</button>
      <span className="sr" role="status">{said}</span>
    </>
  );
}
