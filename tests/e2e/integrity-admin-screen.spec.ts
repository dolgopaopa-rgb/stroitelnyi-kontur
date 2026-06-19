import { expect, test } from "@playwright/test";
import { openApp, switchRole } from "../helpers/auth";

test("admin can open read-only data integrity diagnostics", async ({ page }) => {
  await openApp(page, "/settings");
  await switchRole(page, "owner");

  const panel = page.locator('[data-testid="data-integrity-panel"]');
  await expect(panel).toBeVisible();
  await expect(page.locator("#dataIntegrityStats")).toBeVisible();
  await expect(page.locator("[data-integrity-filter]")).toHaveCount(7);
  await page.locator("#refreshIntegrityButton").click();
  await expect(page.locator("#dataIntegrityRows")).toBeVisible();
});
