import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      JWT_SECRET: "test-jwt-secret-Ken-phase3",
      ENABLE_DEV_AUTH_TOOLS: "true",
    },
    fileParallelism: false,
  },
});
