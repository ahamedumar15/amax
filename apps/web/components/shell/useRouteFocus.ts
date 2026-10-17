"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { announce } from "@amax/ui";
import { takeKeptFocus } from "./route-focus";

export function useRouteFocus() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // Chat moved the page for the person (057): say where they are, but keep focus in the chat.
    const keep = takeKeptFocus(pathname);
    const heading = document.querySelector<HTMLElement>("main h1");
    if (!heading) return;
    if (keep) { announce(`${heading.textContent ?? ""} screen`); return; }
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    announce(`${heading.textContent ?? ""} screen`);
  }, [pathname]);
  return pathname;
}
