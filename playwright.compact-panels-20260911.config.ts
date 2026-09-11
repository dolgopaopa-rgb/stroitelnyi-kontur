import { defineConfig, devices } from "@playwright/test";
import { homedir } from "node:os";
import { delimiter, resolve } from "node:path";

const runtimePythonDir = resolve(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python");
const path = process.env.PATH || process.env.Path || "";
// Playwright merges process.env into webServer.env, so remove inherited credentials first.
const allowedEnvironment = new Set([
  "systemroot", "windir", "comspec", "temp", "tmp", "userprofile", "home",
  "homedrive", "homepath", "appdata", "localappdata", "programdata", "programfiles",
  "programfiles(x86)", "commonprogramfiles", "commonprogramfiles(x86)",
  "pathext", "number_of_processors", "processor_architecture", "os",
]);
for (const key of Object.keys(process.env)) {
  if (!allowedEnvironment.has(key.toLowerCase())) delete process.env[key];
}
process.env.PATH = `${runtimePythonDir}${delimiter}${path}`;

const baseURL = "http://127.0.0.1:8911";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "compact-panels-20260911.spec.ts",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [
    ["list"],
    ["html", { outputFolder: ".tmp/maria/report/html", open: "never" }],
    ["json", { outputFile: ".tmp/maria/report/results.json" }],
  ],
  outputDir: ".tmp/maria/report/output",
  use: {
    baseURL,
    channel: "chrome",
    serviceWorkers: "block",
    storageState: { cookies: [], origins: [] },
    httpCredentials: undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "desktop-chrome", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile-390", use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `"${resolve(runtimePythonDir, "python.exe")}" app/server.py`,
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      HOST: "127.0.0.1", PORT: "8911", APP_DATA_DIR: resolve(".tmp/maria/data"),
      STORAGE_PROVIDER: "local", PYTHONUNBUFFERED: "1", PYTHONUTF8: "1",
      PYTHONDONTWRITEBYTECODE: "1", MAX_FEEDBACK_ALLOW_BOT_TOKEN: "0",
    },
  },
});
