import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("today screen has role panel and attention list", async ({ page }) => {
  await openApp(page, "/today");
  await expect(page.locator("#todayRoleQuestion")).toBeVisible();
  await expect(page.locator('[data-testid="today-attention-list"]')).toBeAttached();
  await expect(page.locator('[data-testid="today-page"]')).toBeVisible();
});
