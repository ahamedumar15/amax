import type { ReactNode } from "react";

export type ChipTone = "neutral" | "agent" | "good" | "warn" | "bad";

export function Chip({ tone = "neutral", children }: { tone?: ChipTone; children: ReactNode }) {
  return <span className={tone === "neutral" ? "chip" : `chip ${tone}`}>{children}</span>;
}
