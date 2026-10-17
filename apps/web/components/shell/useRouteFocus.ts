"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { announce } from "@amax/ui";

export function useRouteFocus() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const heading = document.querySelector<HTMLElement>("main h1");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    announce(`${heading.textContent ?? ""} screen`);
  }, [pathname]);
  return pathname;
}
