import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import type { GoalStatus, RunStatus } from "../contracts";
import "./keyflow.css";

export const viewerOrNull = (viewer: unknown) => (viewer as Viewer | null) ?? null;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
export const avatar = (name: string) => `a${([...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 4) + 1}`;
export const longDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const stamp = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });

/** "4 min ago", "in 11 min", "2 h ago", "3 days ago". */
export function ago(iso: string, now = Date.now()) {
  const min = Math.round((Date.parse(iso) - now) / 60_000);
  const n = Math.abs(min);
  const text = n < 1 ? "now" : n < 60 ? `${n} min` : n < 48 * 60 ? `${Math.round(n / 60)} h` : `${Math.round(n / 1440)} days`;
  return n < 1 ? "just now" : min < 0 ? `${text} ago` : `in ${text}`;
}

export const RUN_CHIP: Record<RunStatus, [string, string]> = {
  completed: ["good", "Completed"], "completed-with-errors": ["warn", "Completed with errors"], failed: ["bad", "Failed"], skipped: ["", "Skipped"],
};
export const GOAL_CHIP: Record<GoalStatus, [string, string]> = { "on-track": ["good", "On track"], "at-risk": ["warn", "At risk"], "off-track": ["bad", "Off track"], done: ["", "Done"] };
export const ERROR_CHIP = { refused: ["bad", "Refused"], unmatched: ["warn", "Unmatched"], invalid: ["warn", "Unreadable"] } as const;

export const SignInFirst = ({ what }: { what: string }) => (
  <Card><EmptyState icon="plug" title={`Sign in to see ${what}`} hint="The Keyflow sync and what it brings in come from the database once you're signed in." /></Card>
);
