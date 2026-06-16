import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("materials pipeline filters are visible", async ({ page }) => {
  await openApp(page, "/materials");
  await expect(page.locator('[data-testid="material-status-tabs"]')).toBeVisible();
  await expect(page.locator('[data-material-pipeline-filter]')).not.toHaveCount(0);
});
