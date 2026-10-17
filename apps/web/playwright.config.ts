import { defineConfig } from "@playwright/test";

const port = 3500;

export default defineConfig({
  testDir: "tests/e2e",
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
