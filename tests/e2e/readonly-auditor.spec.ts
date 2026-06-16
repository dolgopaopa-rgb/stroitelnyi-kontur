import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";

test("ai auditor cannot mutate data", async ({ page }) => {
  const result = spawnSync("python", ["tools/create_ai_audit_token.py", "--public-url", process.env.KONTUR_BASE_URL || "http://127.0.0.1:8765"], { encoding: "utf8" });
  const loginUrl = result.stdout.match(/login_url=(\S+)/)?.[1];
  expect(loginUrl).toBeTruthy();
  await page.goto(loginUrl!, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);
  if (!page.url().includes("audit=1")) {
    const openLink = page.locator("#auditOpenLink");
    if (await openLink.count()) {
      await openLink.click();
      await page.waitForTimeout(900);
    }
  }
  expect(page.url()).not.toContain("/login");
  await expect(page.locator("#todayView")).toHaveClass(/active/);
  const sessionResponse = await page.context().request.get(new URL("/api/session", page.url()).toString());
  expect(sessionResponse.status()).toBe(200);
  const session = await sessionResponse.json();
  expect(session.role).toBe("ai_auditor");
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(800);
  const mutateResponse = await page.context().request.post(new URL("/api/tasks", page.url()).toString(), { data: {} });
  expect(mutateResponse.status()).toBe(403);
});
