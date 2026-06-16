import { expect, test } from "@playwright/test";
import { openApp, switchRole } from "../helpers/auth";

test.use({ viewport: { width: 390, height: 844 } });

test("mobile quick actions adapt for foreman and worker", async ({ page }) => {
  await openApp(page, "/today");
  await switchRole(page, "foreman:7");
  await page.locator('[data-testid="mobile-plus-button"]').click();
  await expect(page.locator('[data-testid="mobile-quick-actions"] [data-mobile-action="material"]')).toBeVisible();
  await page.locator("#mobileQuickActionClose").click();
  await switchRole(page, "master");
  await page.locator('[data-testid="mobile-plus-button"]').click();
  await expect(page.locator('[data-testid="mobile-quick-actions"] [data-mobile-action="photo"]')).toBeVisible();
});
