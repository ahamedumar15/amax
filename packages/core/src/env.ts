import { z } from "zod";

const postgresUrl = z.string().regex(/^postgres(ql)?:\/\//, "a postgres:// URL");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AMAX_BASE_URL: z.url().optional(),
  AMAX_MODULES_DISABLED: z.string().regex(/^[a-z0-9,-]*$/, "comma-separated module ids").optional(),
  PORT: z.coerce.number().int().positive().optional(),
  // App connection (role amax_app, row-level security applies) and the schema owner for migrations.
  // Both optional so the app still boots and serves /healthz before a database is configured.
  DATABASE_URL: postgresUrl.optional(),
  DATABASE_MIGRATE_URL: postgresUrl.optional(),
  // Keys the HMAC that replaces classified values in the audit. Moves to 031 secrets later.
  AUDIT_HASH_KEY: z.string().min(32, "at least 32 characters").optional(),
  CRON_SECRET: z.string().min(16, "at least 16 characters").optional(),
  // Auth.js session encryption; required once DATABASE_URL is set (sign-in is enforced then).
  AUTH_SECRET: z.string().min(32, "at least 32 characters").optional(),
  // Fixtures-only "sign in as" for local and CI e2e. Ignored when NODE_ENV=production.
  AMAX_AUTH_DEMO: z.enum(["0", "1"]).optional(),
  AMAX_AUTH_DEMO_TENANT: z.uuid().optional(),
  // S3-compatible object storage (S3, R2, MinIO). The audit export bucket needs object lock.
  S3_ENDPOINT: z.url().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_REGION: z.string().optional(),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(2555),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (parsed.success) return parsed.data;
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  throw new Error(`amax: invalid environment configuration\n${lines.join("\n")}\nFix these variables and restart.`);
}
