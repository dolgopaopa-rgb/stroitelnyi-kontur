import { expect, test } from "@playwright/test";
import { openApp, switchRole } from "../helpers/auth";

test.use({ viewport: { width: 390, height: 844 } });

test("mobile quick actions adapt for foreman and worker", async ({ page }) => {
  // The preview role picker is desktop-only; exercise quick actions at mobile size.
  await page.setViewportSize({ width: 1366, height: 900 });
  await openApp(page, "/today");
  expect(await switchRole(page, "foreman:7")).toBe(true);
  await expect(page.locator("#currentRoleSelect")).toHaveValue("foreman:7");
  await expect(page.locator("#todayView")).toHaveAttribute("data-role", "foreman");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-testid="mobile-plus-button"]').click();
  await expect(page.locator('[data-testid="mobile-quick-actions"] [data-mobile-action="material"]')).toBeVisible();
  await page.locator("#mobileQuickActionClose").click();
  await expect(page.locator('[data-testid="mobile-quick-actions"]')).toBeHidden();
  await page.setViewportSize({ width: 1366, height: 900 });
  expect(await switchRole(page, "master")).toBe(true);
  await expect(page.locator("#currentRoleSelect")).toHaveValue("master");
  await expect(page.locator("#todayView")).toHaveAttribute("data-role", "master");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-testid="mobile-plus-button"]').click();
  await expect(page.locator('[data-testid="mobile-quick-actions"] [data-mobile-action="photo"]')).toBeVisible();
  await expect(page.locator('[data-testid="mobile-quick-actions"] [data-mobile-action="material"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="mobile-quick-actions"] [data-mobile-action="task"]')).toHaveCount(0);
  await page.locator("#mobileQuickActionClose").click();
  await expect(page.locator('[data-testid="mobile-quick-actions"]')).toBeHidden();
});
