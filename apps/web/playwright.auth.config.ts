import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { lumen } from "@amax/testing";

// Signed-in e2e: a real Postgres (DATABASE_MIGRATE_URL) and the fixtures-only demo provider.
const port = Number(process.env.E2E_AUTH_PORT ?? 3501); // parallel worktrees set their own
const admin = new URL(process.env.DATABASE_MIGRATE_URL ?? "postgres://amax:amax@127.0.0.1:5440/amax");
const appUrl = Object.assign(new URL(admin), { username: "amax_app", password: "amax_app", pathname: `/${process.env.E2E_DB ?? "amax_e2e"}` }).toString();

export default defineConfig({
  testDir: "tests/e2e",
  // The visual test (041) sees fixtures.md's data only; AMX (039) is imported after it. Chat writes
  // proposals, so it runs after the specs that count fixture rows.
  projects: [
    { name: "visual", testMatch: /(delivery|api)-visual\.spec\.ts/ },
    { name: "amx", testMatch: /amx\.setup\.ts/, dependencies: ["visual"] },
    { name: "screens", testMatch: /(auth|delivery|sections|ai|mcp|pins|secrets|workflows)\.spec\.ts/, dependencies: ["amx"] },
    { name: "writes", testMatch: /(chat|chat-first|releases|admin|ai-usage|api)\.spec\.ts/, dependencies: ["screens"] },
    { name: "audit", testMatch: /audit\.spec\.ts/, dependencies: ["writes"] },
    // 032: the privacy spec erases the demo erasure request's person, so it runs last.
    { name: "privacy", testMatch: /retention(-visual)?\.spec\.ts/, dependencies: ["audit"] },
  ],
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, colorScheme: "light", reducedMotion: "reduce", browserName: "chromium", trace: process.env.E2E_TRACE ? "retain-on-failure" : "off" },
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
      AMAX_AI_PROVIDER: "scripted",
      NODE_ENV: "test",
      DATABASE_MIGRATE_URL: admin.toString(),
      AMAX_KMS: "local",
      // The whole suite signs in as a handful of demo users; 035's own tests set low limits explicitly.
      AMAX_RATE_PAGE_USER: "100000",
      AMAX_KMS_KEY_FILE: join(tmpdir(), `amax-e2e-kms-${process.env.E2E_DB ?? "amax_e2e"}.key`),
    },
  },
});
