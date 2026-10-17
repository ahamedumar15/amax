"use client";

import { useState, type ReactNode } from "react";

// A pay value the viewer may see stays blurred until they choose Show (the mock's .pay.reveal).
export function Reveal({ children, label }: { children: ReactNode; label: string }) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <span className={shown ? "pay" : "pay reveal"} aria-hidden={!shown}>{children}</span>{" "}
      <button type="button" className="link" onClick={() => setShown(!shown)} aria-label={`${shown ? "Hide" : "Show"} ${label}`}>{shown ? "Hide" : "Show"}</button>
    </>
  );
}
