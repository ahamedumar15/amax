"use client";

import { useEffect, useRef, useState } from "react";
import { applyTheme, readTheme, type ThemeChoice } from "./theme";

const THEMES: ThemeChoice[] = ["system", "light", "dark"];

export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>("system");
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => setTheme(readTheme()), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(false), button.current?.focus());
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const choose = (t: ThemeChoice) => (applyTheme(t), setTheme(t));
  return (
    <div className="mewrap">
      <button ref={button} className="me" type="button" aria-label="Guest, profile and theme" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="av" aria-hidden="true">G</span>
        <div>Guest<small>Sign-in arrives with change 002</small></div>
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Profile">
          <div className="menu-lbl" id="ml-theme">Theme</div>
          <div role="group" aria-labelledby="ml-theme">
            {THEMES.map((t) => (
              <button key={t} type="button" role="menuitemradio" aria-checked={theme === t} onClick={() => choose(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
