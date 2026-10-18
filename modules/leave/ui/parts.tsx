import { notFound } from "next/navigation";
import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import { monthOf } from "../server/calendar";
export { monthName } from "../server/days";
import "./leave.css";

/** A leave type's colour and calendar class, as in the mock's legend. */
export const TYPE_STYLE: Record<string, { color: string; cls: string }> = {
  annual: { color: "#B3A1FF", cls: "an" }, casual: { color: "#7FD8F5", cls: "ca" }, medical: { color: "#F48B9B", cls: "me" }, lieu: { color: "#2FCB8C", cls: "li" },
  personal: { color: "#F48B9B", cls: "me" }, "long-service": { color: "#B3A1FF", cls: "an" }, unpaid: { color: "#C9C6D6", cls: "up" },
};
export const styleOf = (type: string) => TYPE_STYLE[type] ?? TYPE_STYLE.unpaid;

export const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
export const avatar = (name: string) => `a${([...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 4) + 1}`;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const longDate = (iso: string, weekday = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: weekday ? "short" : undefined, month: "short", day: "numeric", timeZone: "UTC" });

export const viewerOrNull = (viewer: unknown) => (viewer as Viewer | null) ?? null;

/** The month in a screen URL: absent is this month, anything else that isn't YYYY-MM is a 404. */
export function monthParam(key: string | undefined, today: string) {
  try {
    return monthOf(key, today);
  } catch {
    notFound();
  }
}

export const SignInFirst = () => (
  <Card><EmptyState icon="calendar" title="Sign in to see leave" hint="Requests, balances and the team calendar come from the database once you're signed in." /></Card>
);
