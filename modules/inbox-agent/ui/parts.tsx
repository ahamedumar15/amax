import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import type { ScanStatus } from "../contracts";
import "./inbox.css";

export const viewerOrNull = (viewer: unknown) => (viewer as Viewer | null) ?? null;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const stamp = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });

/** "12 min ago", "in 48 min", "3 h ago", "21 days ago". */
export function ago(iso: string, now = Date.now()) {
  const min = Math.round((Date.parse(iso) - now) / 60_000);
  const n = Math.abs(min);
  const text = n < 60 ? `${n} min` : n < 48 * 60 ? `${Math.round(n / 60)} h` : `${Math.round(n / 1440)} days`;
  return n < 1 ? "just now" : min < 0 ? `${text} ago` : `in ${text}`;
}

export const SCAN_CHIP: Record<ScanStatus, [string, string]> = { completed: ["good", "Completed"], failed: ["bad", "Failed"], skipped: ["", "Skipped"] };

export const SignInFirst = () => (
  <Card><EmptyState icon="spark" title="Sign in to see the inbox agent" hint="What the agent found in Teams and email comes from the database once you're signed in." /></Card>
);
