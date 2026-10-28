import { defineConfig } from "@playwright/test";

const viewports = [
  [320, 568], [360, 800], [375, 812], [390, 844], [430, 932],
  [768, 1024], [1024, 768], [1280, 720], [1440, 900], [1920, 1080],
] as const;
const baseURL = "http://localhost:5173";

// Deliberately separate from both existing Playwright configurations and CI.
export default defineConfig({
  testDir: "./client/e2e/responsive",
  outputDir: "./client/test-results/responsive",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "client/playwright-report/responsive-html", open: "never" }],
    ["./client/e2e/responsive/reporter.ts"],
  ],
  use: {
    browserName: "chromium",
    baseURL,
    headless: true,
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
    reducedMotion: "reduce",
  },
  webServer: {
    // Launch Vite directly; avoid nested npm/cmd processes during Windows teardown.
    command: "node node_modules/vite/bin/vite.js client --config client/vite.config.ts",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_SHOW_LANDING_PAGE: "true", VITE_API_BASE_URL: `${baseURL}/api` },
  },
  projects: [
    { name: "detector", testMatch: "detector.spec.ts", use: { viewport: { width: 320, height: 568 } } },
    ...viewports.map(([width, height]) => ({
      name: `${width}x${height}`,
      testMatch: "responsive.spec.ts",
      use: { viewport: { width, height } },
    })),
  ],
});
