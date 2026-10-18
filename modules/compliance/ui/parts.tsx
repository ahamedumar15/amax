import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import "./compliance.css";

export const COUNTRY: Record<string, string> = { LK: "Sri Lanka", AU: "Australia" };
export const CLASS_LABEL: Record<string, string> = { personal: "Personal", pay: "Pay", health: "Health", bank: "Bank", performance: "Performance", candidate: "Candidate" };

export const shortDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const viewerOrNull = (viewer: unknown) => (viewer as Viewer | null) ?? null;

/** 1.9 M, 12.4 K, 940. */
export const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)} K` : n.toLocaleString("en-US"));

export const SignInFirst = () => (
  <Card><EmptyState icon="doc" title="Sign in to see compliance" hint="Policies, registers and the audit-chain check come from the database once you're signed in." /></Card>
);
