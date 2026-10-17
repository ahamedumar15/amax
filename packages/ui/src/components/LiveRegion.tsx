"use client";

import { useEffect, useState } from "react";
import { ANNOUNCE_EVENT } from "../announce";

export function LiveRegion() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const onAnnounce = (e: Event) => {
      setMessage("");
      requestAnimationFrame(() => setMessage((e as CustomEvent<string>).detail));
    };
    window.addEventListener(ANNOUNCE_EVENT, onAnnounce);
    return () => window.removeEventListener(ANNOUNCE_EVENT, onAnnounce);
  }, []);
  return <div className="sr" role="status" aria-live="polite" aria-atomic="true">{message}</div>;
}
