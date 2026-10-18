import type { BackupOverview, DrillView, ExportView } from "@amax/core/backup";

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });

export const shortDay = (iso: string) => day.format(new Date(iso));
export const dayTime = (iso: string) => `${day.format(new Date(iso))}, ${time.format(new Date(iso))}`;

export function duration(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "under 1 min";
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

const words = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m < 60 ? `${m} minute${m === 1 ? "" : "s"}` : duration(ms);
};

export const rows = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n.toLocaleString("en"));
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export const RESULT: Record<DrillView["status"], [string, string]> = { requested: ["info", "Waiting to run"], passed: ["good", "Passed"], slow: ["warn", "Slow"], failed: ["bad", "Failed"] };
export const resultText = (d: DrillView) => (d.status === "slow" && d.note ? `Slow, ${d.note.replace(/^slower than /, "over ")}` : RESULT[d.status][1]);

export const lastDrill = (drills: DrillView[]) => drills.find((d) => d.status !== "requested") ?? null;

function drillSentence(d: DrillView | null) {
  if (!d?.startedAt) return "No restore drill has run yet.";
  const chain = d.chainOk ? "the audit chain checked out" : d.chainOk === false ? "the audit chain didn't verify" : "the audit chain wasn't checked";
  const how = d.status === "failed" ? `failed${d.note ? ` (${d.note})` : ""}` : d.status === "slow" ? `was slow, ${words(d.durationMs ?? 0)}` : `passed in ${words(d.durationMs ?? 0)}`;
  return `${weekday.format(new Date(d.startedAt))}'s restore drill ${how}, and ${chain}.`;
}

/** The screen's first line: what can be restored, then the last drill, then anything that needs an Admin. */
export function lede(s: BackupOverview) {
  const parts = [
    s.pitr?.windowDays ? `You can restore to any minute in the last ${s.pitr.windowDays} days.` : "Point-in-time recovery isn't set for this deployment.",
    drillSentence(lastDrill(s.drills)),
    s.storage === "missing" ? `Snapshots have no storage${s.region ? ` in your data region (${s.region})` : ""}, so none are being taken.` : "",
    s.versioned === false ? "File storage keeps no earlier versions." : "",
    s.offboarding ? `This organisation is leaving amax: its data key is destroyed on ${shortDay(s.offboarding.destroyAfter)}.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

export function exportNote(e: ExportView, who: (actor: string | null) => string) {
  const asked = shortDay(e.requestedAt);
  if (e.status === "awaiting_approval") return `${asked}. JSON per module plus files; a second Admin approves, then the link works for 24 hours`;
  if (e.status === "building") return `${asked}. Approved by ${who(e.approvedBy)}; being built`;
  if (e.status === "failed") return `${asked}. Approved by ${who(e.approvedBy)}; the build failed${e.error ? `: ${e.error}` : ""}`;
  if (e.status === "cancelled") return `${asked}. Cancelled before approval`;
  const link = e.expired ? `link expired ${e.expiresAt ? shortDay(e.expiresAt) : ""}` : `link works until ${e.expiresAt ? dayTime(e.expiresAt) : ""} UTC`;
  return `${asked}. Approved by ${who(e.approvedBy)}; ${plural(e.modules, "module")}, ${plural(e.files, "file")}; ${link.trim()}`;
}
