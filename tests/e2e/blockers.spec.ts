import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("blocker cards are structured when blockers exist", async ({ page }) => {
  await openApp(page, "/objects");
  const cards = page.locator('[data-testid="blocker-card"]');
  if (!(await cards.count())) {
    await expect(page.locator("#projectDetail")).toBeVisible();
    return;
  }
  await expect(cards.first().locator('[data-testid="blocker-type-badge"]')).toBeVisible();
  await expect(cards.first().locator('[data-testid="blocker-status-badge"]')).toBeVisible();
  await expect(cards.first().locator('[data-testid="blocker-severity-badge"]')).toBeVisible();
});
