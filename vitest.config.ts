import { resolve } from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

const platform = "core|db|auth|ui|mcp|chat|agents|testing|ai|workflows|api";

export default defineConfig({
  // Module DB suites seed every installed module's fixtures (hr alone is 184 people), and CI runs every
  // package's suites at once, so setup hooks get four minutes (a minute timed out once 024 and 036 landed).
  test: { exclude: [...configDefaults.exclude, "**/tests/e2e/**"], hookTimeout: 240_000 },
  resolve: {
    alias: [
      { find: new RegExp(`^@amax/(${platform})$`), replacement: resolve(__dirname, "packages/$1/src/index.ts") },
      { find: new RegExp(`^@amax/(${platform})/(.*)$`), replacement: resolve(__dirname, "packages/$1/src/$2") },
      { find: /^@amax\/([\w-]+)\/(.*)$/, replacement: resolve(__dirname, "modules/$1/$2") },
    ],
  },
});
