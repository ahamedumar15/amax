import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import "./experience.css";

export const viewerOrNull = (viewer: unknown) => (viewer as Viewer | null) ?? null;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const art = (name: string) => <svg className="art" viewBox="0 0 120 110" aria-hidden="true"><use href={`#dx-art-${name}`} /></svg>;

export const SignInFirst = () => (
  <Card><EmptyState icon="chart" title="Sign in to see digital experience" hint="Scores by department, site and device model come from the database once you're signed in." /></Card>
);
