import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("app opens without white screen", async ({ page }) => {
  await openApp(page, "/today");
  await expect(page.locator('[data-testid="today-page"]')).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(text.trim().length).toBeGreaterThan(20);
});

test("version endpoint exposes build metadata", async ({ request }) => {
  const response = await request.get("/version");
  expect(response.ok()).toBeTruthy();
  const version = await response.json();
  expect(version.appVersion).toBeTruthy();
  expect(version.commitHash).toBeTruthy();
  expect(version.buildTime).toBeTruthy();
  expect(version.deployedAt).toBeTruthy();
  expect(version.environment).toBeTruthy();
});
