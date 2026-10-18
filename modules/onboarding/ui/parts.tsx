import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import "./onboarding.css";

export const needViewer = (viewer: unknown) => (viewer as Viewer | null) ?? null;
export const SignInFirst = () => (
  <Card><EmptyState icon="briefcase" title="Sign in to see onboarding" hint="Joiner and leaver checklists come from the database once you're signed in." /></Card>
);

export const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** A stable avatar colour per person, from the mock's four. */
export const tint = (id: string) => `a${([...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 4) + 1}`;
