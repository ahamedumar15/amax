import type { ReactNode } from "react";
import type { Viewer } from "@amax/auth";
import { Card, EmptyState, type PinRef } from "@amax/ui";
import type { Stage } from "../contracts";
import "./presales.css";

const ICON: Record<string, ReactNode> = {
  bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z" />,
  inbox: <path d="M4 13h4l2 3h4l2-3h4M5 5h14l1 8v6H4v-6z" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4-4" /></>,
  plane: <path d="M3 11 21 3l-6 18-4-7z" />,
  hand: <path d="M7 11V7a2 2 0 0 1 4 0v3M11 10V5a2 2 0 0 1 4 0v5M15 10V7a2 2 0 0 1 4 0v6a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2-4a2 2 0 0 1 3-2l1 2" />,
  trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M10 17h4M12 13v4M8 20h8" />,
  spark: <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />,
};

export const STAGE_UI: Record<Stage, { label: string; icon: string; color: string; chip: [string, string] }> = {
  "new-idea": { label: "New idea", icon: "bulb", color: "#F7D65A", chip: ["#FFF6CC", "#7A5D00"] },
  lead: { label: "Lead", icon: "inbox", color: "#5CC8F0", chip: ["#DFF3FB", "#17648A"] },
  qualified: { label: "Qualified", icon: "search", color: "#A792FF", chip: ["#ECE8FF", "#5B44D6"] },
  proposal: { label: "Proposal", icon: "plane", color: "#F2A93B", chip: ["#FFF1D6", "#9A5B00"] },
  negotiation: { label: "Negotiation", icon: "hand", color: "#7B61FF", chip: ["#ECE8FF", "#5B44D6"] },
  won: { label: "Won", icon: "trophy", color: "#2FCB8C", chip: ["#DDF7EC", "#0F6E4A"] },
  lost: { label: "Lost", icon: "trophy", color: "#F26B5B", chip: ["#FDE7E4", "#A8321F"] },
};

export const Stk = ({ icon, color }: { icon: string; color: string }) => (
  <span className="stk" style={{ ["--c" as string]: color }} aria-hidden="true"><svg viewBox="0 0 24 24">{ICON[icon]}</svg></span>
);

export const StageChip = ({ stage }: { stage: Stage }) => {
  if (stage === "won") return <span className="chip good">Won</span>;
  if (stage === "lost") return <span className="chip bad">Lost</span>;
  const [bg, fg] = STAGE_UI[stage].chip;
  return <span className="chip" style={{ background: bg, color: fg }}>{STAGE_UI[stage].label}</span>;
};

export const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export const money = (amount: number, currency: string) => (currency === "USD" ? usd(amount) : `${currency} ${Math.round(amount).toLocaleString("en-US")}`);
export const approxUsd = (n: number) => `≈ ${usd(Math.round(n / 1000) * 1000)}`;
export const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "–");
export const longDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const initials = (name: string | null) => (name ?? "?").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
export const first = (name: string | null) => (name ?? "Someone").split(" ")[0];
export const daysBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000));
export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export const needViewer = (viewer: unknown) => (viewer as Viewer | null) ?? null;
export const SignInFirst = () => (
  <Card><EmptyState icon="target" title="Sign in to see presales" hint="Opportunities, activities and the pipeline come from the database once you're signed in." /></Card>
);

export const oppPin = (o: { number: string; title: string }): PinRef => ({ label: `${o.number} ${o.title}`, tool: "get_opportunity", args: { number: o.number } });
export const itemPin = (number: string, label: string, id: string): PinRef => ({ label: `${number} ${label}`, tool: "get_opportunity_item", args: { number, id } });
