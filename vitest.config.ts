import { resolve } from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

const platform = "core|db|auth|ui|mcp|chat|agents|testing|ai";

export default defineConfig({
  // Module DB suites seed every installed module's fixtures (hr alone is 184 people), so setup hooks get a minute.
  test: { exclude: [...configDefaults.exclude, "**/tests/e2e/**"], hookTimeout: 60_000 },
  resolve: {
    alias: [
      { find: new RegExp(`^@amax/(${platform})$`), replacement: resolve(__dirname, "packages/$1/src/index.ts") },
      { find: new RegExp(`^@amax/(${platform})/(.*)$`), replacement: resolve(__dirname, "packages/$1/src/$2") },
      { find: /^@amax\/([\w-]+)\/(.*)$/, replacement: resolve(__dirname, "modules/$1/$2") },
    ],
  },
});
