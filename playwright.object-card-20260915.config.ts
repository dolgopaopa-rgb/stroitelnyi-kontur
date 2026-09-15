import { defineConfig, devices } from "@playwright/test";
import { homedir } from "node:os";
import { delimiter, resolve } from "node:path";

const pythonDir = resolve(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python");
const inheritedPath = process.env.PATH || process.env.Path || "";
// Playwright merges the parent environment: remove credentials, proxies and integration settings.
const allowed = new Set([
  "systemroot", "windir", "comspec", "temp", "tmp", "userprofile", "home",
  "homedrive", "homepath", "appdata", "localappdata", "programdata", "programfiles",
  "programfiles(x86)", "commonprogramfiles", "commonprogramfiles(x86)",
  "pathext", "number_of_processors", "processor_architecture", "os",
]);
for (const key of Object.keys(process.env)) {
  if (!allowed.has(key.toLowerCase())) delete process.env[key];
}
process.env.PATH = `${pythonDir}${delimiter}${inheritedPath}`;

const baseURL = "http://127.0.0.1:8915";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "object-card-standard-20260915.spec.ts",
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  updateSnapshots: "none",
  reporter: [
    ["list"],
    ["html", { outputFolder: ".tmp/object-card-20260915/report/html", open: "never" }],
    ["json", { outputFile: ".tmp/object-card-20260915/report/results.json" }],
  ],
  outputDir: ".tmp/object-card-20260915/report/output",
  use: {
    baseURL, channel: "chrome", serviceWorkers: "block",
    storageState: { cookies: [], origins: [] },
    httpCredentials: undefined,
    trace: "retain-on-failure", screenshot: "only-on-failure", video: "off",
  },
  projects: [
    { name: "desktop-chrome", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile-390", use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `"${resolve(pythonDir, "python.exe")}" tests/helpers/object-card-static-server.py`,
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      HOST: "127.0.0.1", PORT: "8915",
      APP_DATA_DIR: resolve(".tmp/object-card-20260915/data"),
      STORAGE_PROVIDER: "local", PYTHONUNBUFFERED: "1", PYTHONUTF8: "1",
      PYTHONDONTWRITEBYTECODE: "1", MAX_FEEDBACK_ALLOW_BOT_TOKEN: "0",
    },
  },
});
