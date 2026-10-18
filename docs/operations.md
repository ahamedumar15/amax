# Operations: backup, restore and tenant export (034)

Payroll, HR files and invoices are records a company can't lose. amax keeps them recoverable in two
layers, and lets a tenant take all its data with it when it leaves.

| Layer | What it covers | Where it lives | Kept |
|---|---|---|---|
| **Point-in-time recovery (PITR)** | The whole Postgres cluster, to any minute | The host: CloudNativePG on k3s, the managed Postgres on Vercel and Cloudflare | 14 days |
| **Tenant snapshots** | One tenant's rows, every table, as JSON sealed with the tenant's data key (031) | Object storage or a volume **in the tenant's data region** (033) | Daily for 14 days, the first of each month for 12 months |
| **File storage** | Objects in the S3 bucket (audit exports, files) | The bucket, with **versioning on** | Noncurrent versions 14 days |

Targets: a **recovery point of 15 minutes or less** and a **recovery time of 4 hours or less**. The
weekly restore drill measures the recovery time; the Backups and export screen (Settings → Backups
and export, Admin only) shows both against their targets.

## Point-in-time recovery, per host

Set `AMAX_PITR` (the method), `AMAX_PITR_RPO_MINUTES` and `AMAX_PITR_WINDOW_DAYS` to what the host
is configured for, so the screen can show it. amax can't see the host's backups itself; a screen that
says "Not set" means these variables are missing, not that nothing is backed up.

### k3s: CloudNativePG with WAL archiving (Helm chart)

1. Install the CloudNativePG operator (`kubectl apply --server-side -f https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.24/releases/cnpg-1.24.1.yaml`).
2. Create a bucket **in the data region**, with server-side encryption (SSE-S3 or a KMS key) and
   versioning on, and a Secret `amax-backup-s3` with `ACCESS_KEY_ID` and `ACCESS_SECRET_KEY`.
3. Install the chart with `postgres.cnpg.enabled=true` and `postgres.cnpg.objectStore.destinationPath=s3://<bucket>/cnpg`
   (`endpointURL` for MinIO or R2). The chart renders a `Cluster` that archives WAL continuously,
   switching segments at least every `archiveTimeout` (5 min, so the recovery point is 5 minutes),
   with `retentionPolicy: 14d`, and a `ScheduledBackup` taking a base backup nightly at 02:00.
4. Point `DATABASE_URL` / `DATABASE_MIGRATE_URL` at the `<release>-pg-rw` service.
5. Set `AMAX_PITR=cnpg AMAX_PITR_RPO_MINUTES=5 AMAX_PITR_WINDOW_DAYS=14`.

To recover, create a new `Cluster` with `bootstrap.recovery` from the same object store and a
`recoveryTarget.targetTime`, check it, then point the app at it. Practise this when the drill can't.

### Vercel and Cloudflare: managed Postgres

The app holds no database of its own on these hosts; PITR is the provider's.

| Provider | Setting | Window | Recovery point |
|---|---|---|---|
| **Neon** | Project → Settings → *History retention* 14 days (paid plans). Restore with a branch at a timestamp | 14 days | Seconds (WAL is streamed) |
| **Supabase** | *Point in Time Recovery* add-on, 14 days | 14 days | About 2 minutes |
| **AWS RDS / Aurora** | Automated backups, retention 14 days, encrypted with a KMS key | 14 days | About 5 minutes |
| **Cloudflare** (Workers reach Postgres through Hyperdrive) | The same: use one of the providers above | | |

Pick the provider's region to match the tenant's data region (033), and set
`AMAX_PITR=<neon|supabase|rds> AMAX_PITR_RPO_MINUTES=… AMAX_PITR_WINDOW_DAYS=14`.

### Podman (a single server)

Run Postgres with `archive_mode=on`, `archive_timeout=5min` and an `archive_command` that copies WAL
off the box (WAL-G or pgBackRest to an encrypted bucket in the data region), plus a nightly base
backup. Without that, a Podman install has tenant snapshots only (no PITR): set `AMAX_PITR=none` and the screen says so.

## Tenant snapshots

The `core.backup-snapshot` workflow (029) runs at 02:00 for every tenant: it reads each table the app
role can see for that tenant (row-level security scopes it), seals each table's JSON with the tenant's
data key (AES-256-GCM, the key wrapped by the KMS, 031) and writes it under `backups/<tenant>/<id>/`.

- **Region (033):** the tenant's storage region, else its data region. `S3_BACKUP_BUCKETS=AU=amax-au,EU=amax-eu`
  maps regions to buckets; `S3_BACKUP_BUCKET` is for tenants with no region. A tenant whose region has no
  bucket gets no snapshot (the run fails and the screen says why): a backup never leaves the region.
  `AMAX_BACKUP_DIR` (with `AMAX_BACKUP_REGION`) keeps snapshots on a volume instead, for Podman and CI.
- **Retention (032):** daily snapshots expire after 14 days and monthly ones after 12 months. Pruning
  pauses entirely while any legal hold is active: a snapshot holds everyone's data. The snapshot rows
  themselves are a 032 retention rule ("Backup snapshots", 13 months).
- **What's left out:** working state with no value after a restore (sessions, OAuth codes, claims,
  dedupe keys, the outbox).

## The weekly restore drill (AC-3)

`apps/web/scripts/backups.ts drill`, from the image built with `docker build --target ops`, finds the
tenants due a drill (`backup.drills_due()`: no drill since Sunday 00:00 UTC, or one asked for in chat
with `request_restore_drill`). For each, it:

1. wipes the scratch database (`AMAX_DRILL_DATABASE_URL`, the owner of a database used for nothing else) and runs every migration into it;
2. restores the tenant's latest snapshot, parents before children;
3. compares every table's row count with the count recorded when the snapshot was taken, and
   re-verifies the audit hash chain (050) in the restored copy;
4. wipes the scratch database again, so no restored row outlives the drill;
5. records the result (backup restored, duration, rows and tables checked, chain) through
   `recordDrill`, audited as the drill job. Over an hour is *slow*; a count mismatch, a broken chain,
   an error or over 4 hours is *failed*, and the Settings hub puts it first.

Where it runs:

| Host | Runner |
|---|---|
| k3s | The chart's `restore-drill` CronJob: `backups.drill.enabled=true`, every 15 minutes (it drills only what is due) |
| Podman | `deploy/podman/amax-restore-drill.container` and `.timer` |
| Vercel / Cloudflare | A scheduled CI job with the same command, against a scratch branch or database |
| CI | The `docker-k3s` job runs it on k3d on every pull request: Postgres in the cluster, the demo tenant seeded, a snapshot, then a Job from the CronJob, and the recorded result must be *passed* |

## Tenant export (AC-4)

An Admin asks in chat (`request_tenant_export`, with a reason); a **different** Admin approves it
(`approve_tenant_export`). Both happen only on chat's confirm card, never over MCP or the API. The
approval starts the `core.tenant-export` workflow, which writes one tar:

- `manifest.json`: counts per module and table, the file list, and the privacy state (erased people,
  open erasure requests, active legal holds);
- `modules/<module>.json`: every table of that module, as JSON;
- `files/…`: the tenant's files (today the write-once audit, trace and AI-usage exports).

People erased under 032 appear anonymised, as they are everywhere. Credentials never leave: connector
secrets, tokens, password and token hashes are dropped. The tar is sealed at rest with the data key
in the tenant's region. `get_tenant_export_link` gives a signed link (`/api/backups/export/<id>`)
that works for a signed-in Admin of the tenant for **24 hours** after the build; each download is
audited. The daily snapshot run deletes expired export files.

IT Admin can't see this screen or its tools: the export carries pay and money (the pricing class, 055).

## A tenant leaving amax (AC-5)

`start_tenant_offboarding` (an Admin, on chat's confirm card) records the offboarding, **offers an
export** (an export request awaiting a second Admin) and starts `core.tenant-offboarding` (029). The
workflow waits **30 days**, then waits out any active legal hold, then destroys the tenant's data key
through `backup.destroy_data_key()`: a SECURITY DEFINER function owned by `amax_keys` that checks the
30 days and legal holds again. `amax_app` can never update `secrets.data_key` itself. From then on
every snapshot and export of that tenant is unreadable (crypto-shredding), and so are its connector
secrets. `cancel_tenant_offboarding` stops it any time before. Each step is audited:
`backup.offboarding.start`, `backup.export.*`, `backup.offboarding.cancel`, `backup.data_key.destroy`.

What the key doesn't reach: the cluster's PITR copies, which age out of the 14-day window within two
weeks of the destroy, and the tenant's live rows, which an operator deletes after the destroy.

## Environment

| Variable | Meaning |
|---|---|
| `AMAX_PITR`, `AMAX_PITR_RPO_MINUTES`, `AMAX_PITR_WINDOW_DAYS` | What the host's PITR is set to (shown on screen) |
| `S3_BACKUP_BUCKET`, `S3_BACKUP_BUCKETS` | Snapshot and export buckets: default, and per region (`AU=bucket,EU=bucket`). Uses the `S3_ENDPOINT` credentials |
| `AMAX_BACKUP_DIR`, `AMAX_BACKUP_REGION` | Snapshots on a volume instead, and the region that volume is in |
| `AMAX_DRILL_DATABASE_URL` | The drill's scratch database (its owner). Never the live database |
| `AMAX_KMS`, … | The key service that wraps each tenant's data key (031). Snapshots need it |
