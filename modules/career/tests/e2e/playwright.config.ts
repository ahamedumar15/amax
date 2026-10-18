import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const port = Number(process.env.CAREER_E2E_PORT ?? 3566);
const tenant = "11111111-1111-4111-8111-111111111111";
const admin = new URL(process.env.DATABASE_MIGRATE_URL ?? "postgres://amax:amax@127.0.0.1:5440/amax");
const appUrl = Object.assign(new URL(admin), { username: "amax_app", password: "amax_app", pathname: `/${process.env.CAREER_E2E_DB ?? "amax_e2e_066"}` }).toString();
const web = join(import.meta.dirname, "../../../../apps/web");

export default defineConfig({
  testDir: ".",
  testMatch: /career\.spec\.ts/,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, colorScheme: "light", reducedMotion: "reduce", browserName: "chromium" },
  webServer: {
    command: `pnpm exec tsx --import ${join(import.meta.dirname, "css-hook.mjs")} ${join(import.meta.dirname, "setup.ts")} && pnpm start --port ${port}`,
    cwd: web,
    url: `http://localhost:${port}/healthz`,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: appUrl,
      AUTH_SECRET: "e2e-auth-secret-e2e-auth-secret-e2e",
      AUDIT_HASH_KEY: "e2e-audit-key-e2e-audit-key-e2e-audit",
      AMAX_AUTH_DEMO: "1",
      AMAX_AUTH_DEMO_TENANT: tenant,
      AMAX_AUTH_PASSWORD_TENANT: tenant,
      AMAX_AI_PROVIDER: "scripted",
      NODE_ENV: "test",
      DATABASE_MIGRATE_URL: admin.toString(),
      CAREER_E2E_DB: process.env.CAREER_E2E_DB ?? "amax_e2e_066",
    },
  },
});
