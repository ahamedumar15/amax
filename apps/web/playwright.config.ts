import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3500); // parallel worktrees set their own

export default defineConfig({
  testDir: "tests/e2e",
  // Signed-in flows need Postgres: playwright.auth.config.ts (pnpm e2e:auth).
  testIgnore: /(auth|delivery|delivery-visual|ai|mcp|chat|pins|releases|secrets|workflows)\.spec\.ts|amx\.setup\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, colorScheme: "light", reducedMotion: "reduce", browserName: "chromium" },
  webServer: {
    command: `pnpm start --port ${port}`,
    url: `http://localhost:${port}/healthz`,
    reuseExistingServer: !process.env.CI,
  },
});
