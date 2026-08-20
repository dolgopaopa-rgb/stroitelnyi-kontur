import { defineConfig, devices } from "@playwright/test";

const localQaPort = process.env.KONTUR_QA_PORT || "8765";
const baseURL = process.env.KONTUR_BASE_URL || `http://127.0.0.1:${localQaPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "qa-artifacts/latest/playwright-report", open: "never" }],
    ["json", { outputFile: "qa-artifacts/latest/playwright-results.json" }]
  ],
  use: {
    baseURL,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome"
  },
  webServer: process.env.KONTUR_BASE_URL
    ? undefined
    : {
        command: `python app/server.py`,
        url: `${baseURL}/health`,
        reuseExistingServer: false,
        env: {
          HOST: "127.0.0.1",
          PORT: localQaPort,
          MAX_FEEDBACK_INGEST_TOKEN: process.env.MAX_FEEDBACK_INGEST_TOKEN || "e2e-feedback-ingest-token",
        },
        timeout: 30_000
      },
  projects: [
    { name: "desktop-chrome", use: { viewport: { width: 1366, height: 900 } } },
    { name: "mobile-390", use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } }
  ],
  outputDir: "qa-artifacts/latest/playwright-output"
});
