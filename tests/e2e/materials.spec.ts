import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("materials page has pipeline and quick filters", async ({ page }) => {
  await openApp(page, "/materials");
  await expect(page.locator('[data-testid="materials-pipeline"]')).toBeVisible();
  await expect(page.locator('[data-testid="material-status-tabs"]')).toBeVisible();
  await expect(page.locator("[data-material-quick-filter]").first()).toBeVisible();
});
