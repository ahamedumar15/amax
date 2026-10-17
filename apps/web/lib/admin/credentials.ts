import { EXPIRY_WINDOW_DAYS, type CredentialRow } from "@amax/core/secrets";

const DAY = 86_400_000;
export const ROTATION_DAYS = 90;
export const SECRET_FILTERS = ["all", "expiring", "rotated"] as const;
export type SecretFilter = (typeof SECRET_FILTERS)[number];

export const daysUntil = (d: Date, now: Date) => Math.ceil((d.getTime() - now.getTime()) / DAY);

export const pastExpiry = (r: CredentialRow, now: Date) =>
  r.status === "expired" || (r.status === "active" && !!r.expiresAt && r.expiresAt.getTime() <= now.getTime());

export const expiringSoon = (r: CredentialRow, now: Date) =>
  r.status === "active" && !!r.expiresAt && !pastExpiry(r, now) && daysUntil(r.expiresAt, now) <= EXPIRY_WINDOW_DAYS;

export const rotatedRecently = (r: CredentialRow, now: Date) =>
  r.status === "active" && !!r.lastRotatedAt && now.getTime() - r.lastRotatedAt.getTime() <= ROTATION_DAYS * DAY;

export function filterCredentials(rows: CredentialRow[], filter: SecretFilter, now: Date) {
  if (filter === "expiring") return rows.filter((r) => expiringSoon(r, now)).sort((a, b) => a.expiresAt!.getTime() - b.expiresAt!.getTime());
  if (filter === "rotated") return rows.filter((r) => rotatedRecently(r, now));
  return rows;
}
