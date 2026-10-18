import type { Tx } from "@amax/db";
import type { Env } from "../env";
import { fileStorage } from "../adapters/storage-fs";
import { s3Storage, type Storage } from "../adapters/storage";

export type Pitr = { method: string; rpoMinutes: number | null; windowDays: number | null };
type Start = (tenantId: string, workflow: string, input: { [k: string]: string }, options: { key: string; startedBy: string; tx: Tx }) => Promise<string>;

export type BackupConfig = {
  /** Where a tenant's snapshots and exports go: storage in its data region, or null when there is none. */
  storageFor: (region: string | null) => Storage | null;
  /** The app's own file storage, whose objects the tenant export includes. */
  files: () => Storage | null;
  pitr: Pitr | null;
  /** Signs export links (HMAC); the app passes its AUTH_SECRET. */
  linkKey: string;
  /** Starts a 029 workflow in the caller's transaction (the host registers its engine). */
  start: Start | null;
};

let config: BackupConfig = { storageFor: () => null, files: () => null, pitr: null, linkKey: "", start: null };

export const configureBackups = (c: Partial<BackupConfig>) => {
  config = { ...config, ...c };
};
export const backupConfig = () => config;

const regionOf = (r: string | null | undefined) => (r ? r.trim().toUpperCase() : null);

/** A bucket or directory per region; a tenant with a data region never falls back to another region's. */
export function backupStorageFromEnv(env: Env): BackupConfig["storageFor"] {
  if (env.AMAX_BACKUP_DIR) {
    const dir = fileStorage(env.AMAX_BACKUP_DIR);
    const home = regionOf(env.AMAX_BACKUP_REGION);
    return (region) => (!regionOf(region) || regionOf(region) === home ? dir : null);
  }
  const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION } = env;
  if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return () => null;
  const byRegion = new Map((env.S3_BACKUP_BUCKETS ?? "").split(",").filter(Boolean).map((p) => p.split("=") as [string, string]).map(([r, b]) => [regionOf(r)!, b]));
  return (region) => {
    const bucket = regionOf(region) ? byRegion.get(regionOf(region)!) : env.S3_BACKUP_BUCKET;
    return bucket ? s3Storage({ endpoint: S3_ENDPOINT, bucket, accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY, region: S3_REGION }) : null;
  };
}

export const pitrFromEnv = (env: Env): Pitr | null =>
  env.AMAX_PITR && env.AMAX_PITR !== "none" ? { method: env.AMAX_PITR, rpoMinutes: env.AMAX_PITR_RPO_MINUTES ?? null, windowDays: env.AMAX_PITR_WINDOW_DAYS ?? null } : null;
