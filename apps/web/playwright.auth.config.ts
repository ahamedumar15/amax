import { defineConfig } from "@playwright/test";
import { lumen } from "@amax/testing";

// Signed-in e2e: a real Postgres (DATABASE_MIGRATE_URL) and the fixtures-only demo provider.
const port = 3501;
const admin = new URL(process.env.DATABASE_MIGRATE_URL ?? "postgres://amax:amax@127.0.0.1:5440/amax");
const appUrl = Object.assign(new URL(admin), { username: "amax_app", password: "amax_app", pathname: "/amax_e2e" }).toString();

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /(auth|delivery|ai)\.spec\.ts/,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, colorScheme: "light", reducedMotion: "reduce", browserName: "chromium" },
  webServer: {
    command: `pnpm exec tsx tests/e2e/global-auth.ts && pnpm start --port ${port}`,
    url: `http://localhost:${port}/healthz`,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: appUrl,
      AUTH_SECRET: "e2e-auth-secret-e2e-auth-secret-e2e",
      AUDIT_HASH_KEY: "e2e-audit-key-e2e-audit-key-e2e-audit",
      AMAX_AUTH_DEMO: "1",
      AMAX_AUTH_DEMO_TENANT: lumen.tenant.id,
      AMAX_AUTH_PASSWORD_TENANT: lumen.tenant.id,
      NODE_ENV: "test",
      DATABASE_MIGRATE_URL: admin.toString(),
    },
  },
});
