import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import "./it-access.css";

export const needViewer = (viewer: unknown) => (viewer as Viewer | null) ?? null;
export const SignInFirst = () => (
  <Card><EmptyState icon="key" title="Sign in to see access and licences" hint="Licences, devices and access come from the database once you're signed in." /></Card>
);
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
/** "Nov 15" and "Jul 2026". */
export const dayMonth = (iso: string) => fmt(iso, { month: "short", day: "numeric" });
export const monthYear = (iso: string) => fmt(iso, { month: "short", year: "numeric" });
export const Logo = ({ letter, color }: { letter: string; color: string }) => <span className="logo-sq" style={{ background: color }} aria-hidden="true">{letter}</span>;
export const tint = (id: string) => `a${([...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 4) + 1}`;
export const initials = (name: string) => name.replace(/,.*$/, "").trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
