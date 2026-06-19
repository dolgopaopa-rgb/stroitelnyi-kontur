import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("materials pipeline filters are visible", async ({ page }) => {
  await openApp(page, "/materials");
  await expect(page.locator('[data-testid="material-status-tabs"]')).toBeVisible();
  const filters = await page.locator("[data-material-pipeline-filter]").evaluateAll((buttons) =>
    buttons.map((button) => (button as HTMLElement).dataset.materialPipelineFilter)
  );
  expect(filters).toEqual(["all", "needs_approval", "approved", "ordered", "in_transit", "delivered", "problem", "closed"]);
});
