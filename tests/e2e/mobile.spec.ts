import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 375, height: 812 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
]) {
  test(`mobile layout ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openApp(page, "/today");
    await expect(page.locator('[data-testid="mobile-bottom-nav"]')).toBeVisible();
    await expect
      .poll(async () => {
        try {
          return await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 4);
        } catch {
          return true;
        }
      })
      .toBeFalsy();
  });
}
