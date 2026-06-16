import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";

test("ai auditor cannot mutate data", async ({ page }) => {
  const result = spawnSync("python", ["tools/create_ai_audit_token.py", "--public-url", process.env.KONTUR_BASE_URL || "http://127.0.0.1:8765"], { encoding: "utf8" });
  const loginUrl = result.stdout.match(/login_url=(\S+)/)?.[1];
  expect(loginUrl).toBeTruthy();
  await page.goto(loginUrl!, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const status = await page.evaluate(async () => {
    const response = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    return response.status;
  });
  expect(status).toBe(403);
});
