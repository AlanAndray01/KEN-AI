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
      // A developer's Worker URL/key must not reroute unrelated test fixtures.
      CLOUDFLARE_WORKER_URL: "",
      KEN_API_KEY: "",
    },
    fileParallelism: false,
  },
});
