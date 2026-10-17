import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import type { DirectoryRow } from "../server/queries";
import "./hr.css";

const COUNTRY: Record<string, string> = { LK: "Sri Lanka", AU: "Australia" };
export const countryName = (code: string, fallback = code) => COUNTRY[code] ?? fallback;

export const needViewer = (viewer: unknown) => (viewer as Viewer | null) ?? null;
export const SignInFirst = () => (
  <Card><EmptyState icon="user" title="Sign in to see people" hint="The directory and person records come from the database once you're signed in." /></Card>
);

export const longDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "–");
export const shortDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "–");
export const monthYear = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : "–");

/** Avatar gradient a1–a4, stable per person. */
export const avClass = (name: string) => `a${([...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 4) + 1}`;

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** Status chip as the mock shows it: joining, probation, recently joined, left, or active. */
export function statusChip(p: DirectoryRow, today: string): [string, string] {
  if (p.status === "joining") return ["agent", `Joins ${shortDate(p.joinedOn)}`];
  if (p.status === "left") return ["bad", `Left ${shortDate(p.leftOn)}`];
  const within = (from: string | null, to: string | null) => from !== null && to !== null && daysBetween(from, to) >= 0 && daysBetween(from, to) <= 31;
  if (within(today, p.probationEnds)) return ["warn", `Probation ends ${shortDate(p.probationEnds)}`];
  if (within(p.joinedOn, today)) return ["good", `Joined ${shortDate(p.joinedOn)}`];
  return ["good", "Active"];
}

export const todayLabel = (p: DirectoryRow) => (p.status === "joining" ? "Onboarding" : p.status === "left" ? "–" : "Working");
