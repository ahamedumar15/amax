import { createHmac, timingSafeEqual } from "node:crypto";
import { backupConfig } from "./config";

const mac = (tenantId: string, id: string, exp: number) => createHmac("sha256", backupConfig().linkKey).update(`amax-export:${tenantId}:${id}:${exp}`).digest("base64url");

/** AC-4: a link to the export that stops working at `expiresAt` (24 hours after it was built). */
export function exportLink(tenantId: string, id: string, expiresAt: Date) {
  if (!backupConfig().linkKey) throw new Error("backups: no link key is configured");
  const exp = Math.floor(expiresAt.getTime() / 1000);
  return `/api/backups/export/${id}?exp=${exp}&sig=${mac(tenantId, id, exp)}`;
}

export function linkValid(tenantId: string, id: string, exp: number, sig: string, now = Date.now()) {
  if (!backupConfig().linkKey || !Number.isInteger(exp) || exp * 1000 <= now) return false;
  const want = Buffer.from(mac(tenantId, id, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
