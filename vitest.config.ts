import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const platform = "core|db|auth|ui|mcp|chat|agents|testing";

export default defineConfig({
  resolve: {
    alias: [
      { find: new RegExp(`^@amax/(${platform})$`), replacement: resolve(__dirname, "packages/$1/src/index.ts") },
      { find: new RegExp(`^@amax/(${platform})/(.*)$`), replacement: resolve(__dirname, "packages/$1/src/$2") },
      { find: /^@amax\/([\w-]+)\/(.*)$/, replacement: resolve(__dirname, "modules/$1/$2") },
    ],
  },
});
