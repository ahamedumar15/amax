import type { ReactNode } from "react";
import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import type { Phase } from "../contracts";
import "./delivery.css";

export const COLOR: Record<string, string> = { violet: "var(--violet)", amber: "var(--amber)", pink: "var(--pink)", mint: "var(--mint)" };

const STK: Record<string, ReactNode> = {
  bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z" />,
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  code: <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13 6l-2 12" />,
  check: <path d="m5 12 5 5 9-10" />,
  rocket: <><path d="M12 15c-2-2-3-5-1-9 2-2 5-3 8-3 0 3-1 6-3 8-4 2-7 1-9-1" /><path d="M9 12l-4 1 2-4 3-1" /></>,
};

export const PHASE_UI: Record<Phase, { label: string; icon: string; color: string; chip: string }> = {
  proposed: { label: "Proposed", icon: "bulb", color: "#F7D65A", chip: "warn" },
  planned: { label: "Planned", icon: "map", color: "#5CC8F0", chip: "info" },
  building: { label: "Building", icon: "code", color: "#7B61FF", chip: "agent" },
  verified: { label: "Verified", icon: "check", color: "#2FCB8C", chip: "good" },
  released: { label: "Released", icon: "rocket", color: "#F48B9B", chip: "pink" },
};

export const Stk = ({ phase }: { phase: Phase }) => (
  <span className="stk" style={{ ["--c" as string]: PHASE_UI[phase].color }} aria-hidden="true">
    <svg viewBox="0 0 24 24">{STK[PHASE_UI[phase].icon]}</svg>
  </span>
);

export const PhaseChip = ({ phase }: { phase: Phase }) => <span className={`chip ${PHASE_UI[phase].chip}`}>{PHASE_UI[phase].label}</span>;

export const usd = (n: number | null) => (n === null ? "–" : `$${Math.round(n).toLocaleString("en-US")}`);
export { day } from "../pins";
export const initials = (name: string | null) => (name ?? "?").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
export const shortName = (name: string | null) => (name ? `${name.split(" ")[0]} ${name.split(" ")[1]?.[0] ?? ""}.` : "–");

// Screens need a signed-in viewer; the guest preview explains instead.
export function needViewer(viewer: unknown): Viewer | null {
  return (viewer as Viewer | null) ?? null;
}
export const SignInFirst = () => (
  <Card><EmptyState icon="grid" title="Sign in to see delivery" hint="Projects, proposals and releases come from the database once you're signed in." /></Card>
);
