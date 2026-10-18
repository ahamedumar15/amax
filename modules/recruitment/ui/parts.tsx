import type { Viewer } from "@amax/auth";
import { Card, EmptyState, Masked } from "@amax/ui";
import "./recruitment.css";

export const needViewer = (viewer: unknown) => (viewer as Viewer | null) ?? null;
export const SignInFirst = () => (
  <Card><EmptyState icon="briefcase" title="Sign in to see recruitment" hint="The pipeline comes from the database once you're signed in." /></Card>
);
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
export const word = (n: number) => WORDS[n] ?? String(n);
export const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: iso.length === 10 ? "UTC" : "Asia/Colombo" });
/** "Thu 10:00", in Colombo time, where the demo's interviews are. */
export const slot = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Colombo" }).replace(",", "");
export const tint = (id: string) => `a${([...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 4) + 1}`;

/** A candidate field, or •••• when the server masked it for this viewer (002 `candidate`). */
export function Field({ v }: { v: unknown }) {
  return typeof v === "string" ? <>{v}</> : <Masked masked />;
}
