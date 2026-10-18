import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import "./learning.css";

export const needViewer = (viewer: unknown) => (viewer as Viewer | null) ?? null;
export const SignInFirst = () => (
  <Card><EmptyState icon="book" title="Sign in to see learning" hint="Programmes, participation and certifications come from the database once you're signed in." /></Card>
);

export const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const nextYear = (on: string) => new Date(Date.UTC(Number(on.slice(0, 4)) + 1, 0, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
/** "before January": the expiry window the screen counts runs to the end of this year. */
export const beforeNextYear = (on: string) => `before ${nextYear(on)}`;
/** A stable avatar colour per person, from the mock's four. */
export const tint = (id: string) => `a${([...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 4) + 1}`;
