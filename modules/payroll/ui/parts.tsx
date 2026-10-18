import type { Viewer } from "@amax/auth";
import { Card, EmptyState, Masked } from "@amax/ui";
import "./payroll.css";

export const needViewer = (viewer: unknown) => (viewer as Viewer | null) ?? null;
export const SignInFirst = () => (
  <Card><EmptyState icon="cash" title="Sign in to see payroll" hint="Pay runs come from the database once you're signed in." /></Card>
);

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "333250.00" → "333,250"; with `exact`, "333,250.00". */
export const money = (v: string, exact = false) => (exact ? cents : whole).format(Number(v));
/** A tile's figure: "LKR 2.54M" from a million up, "LKR 254,065" below. */
export const big = (currency: string, v: string) => (Math.abs(Number(v)) >= 1e6 ? `${currency} ${(Number(v) / 1e6).toFixed(2)}M` : `${currency} ${money(v)}`);
/** "+ 12,400" or "− 9,850". */
export const signed = (v: string) => `${Number(v) < 0 ? "−" : "+"} ${money(String(Math.abs(Number(v))))}`;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** A stable avatar colour per person, from the mock's four. */
export const tint = (id: string) => `a${([...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 4) + 1}`;

/** A pay value, or •••• when the server masked it for this viewer (002). */
export function Pay({ v, children }: { v: unknown; children?: (s: string) => string }) {
  return typeof v === "string" ? <Masked masked={false}>{children ? children(v) : money(v)}</Masked> : <Masked masked />;
}
