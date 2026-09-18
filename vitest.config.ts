import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  test: {
    include: ["tests/database/**/*.test.ts", "tests/api/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 15000
  }
});
