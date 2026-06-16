import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("app opens without white screen", async ({ page }) => {
  await openApp(page, "/today");
  await expect(page.locator('[data-testid="today-page"]')).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(text.trim().length).toBeGreaterThan(20);
});
