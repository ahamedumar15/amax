import type { RequestView, RuleView } from "@amax/core/privacy";

const UNITS: Record<string, [string, string]> = { Y: ["year", "years"], M: ["month", "months"], W: ["week", "weeks"], D: ["day", "days"] };

export function periodLabel(period: string) {
  return [...period.matchAll(/(\d+)([YMWD])/g)].map(([, n, u]) => `${n} ${UNITS[u][Number(n) === 1 ? 0 : 1]}`).join(" ");
}

const STARTS: Record<string, string> = {
  left_on: "Last day", ends_on: "Employment ends", completed_at: "Request completed", finished_at: "Run ends", run_finished_at: "Run ends", closed_at: "Closed",
  released_at: "Released", decided_at: "Decision", created_at: "Created", updated_at: "Last change", at: "Recorded", dated_on: "Document date", month: "Month ends",
  voided_at: "Voided", removed_at: "Removed", found_at: "Found",
};

const words = (col: string) => STARTS[col] ?? col.replace(/_(at|on)$/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function startsLabel(r: Pick<RuleView, "start">) {
  const at = r.start.at.map(words);
  const first = at.length ? [...new Set(at)].join(" or ") : "Last change";
  return r.start.idle ? `${first}, or ${periodLabel(r.start.idle)} without a change` : first;
}

export const CLASS_CHIP: Record<string, [string, string]> = {
  pay: ["pink", "Pay"], health: ["pink", "Health"], bank: ["pink", "Bank"], performance: ["warn", "Performance"], candidate: ["info", "Candidate"], personal: ["info", "Person"],
};

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export function requestNote(r: RequestView, openedBy: string) {
  if (r.status === "completed") return r.kind === "access" ? `Package ready: ${plural(r.summary.total, "record")}` : `Erased ${r.completedAt?.slice(0, 10) ?? ""}; ${plural(r.summary.kept, "record")} kept by law or design`;
  const kept = r.inventory.find((i) => i.kept && i.rule);
  const keptText = kept ? `${kept.label} kept by law; ` : "";
  const action = r.kind === "erasure" ? "to erase" : "in the package";
  return `Opened by ${openedBy}. ${keptText}${plural(r.summary.toErase, kept ? "other record" : "record")} ${action}`;
}

export const requestTitle = (r: RequestView) => `${r.kind === "erasure" ? "Erasure" : "Access"}, ${r.subjectLabel}`;

const regions = new Intl.DisplayNames(["en"], { type: "region" });
export const country = (code: string) => regions.of(code) ?? code;
