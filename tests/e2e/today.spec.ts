import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("today screen has role panel and attention list", async ({ page }) => {
  await openApp(page, "/today");
  await expect(page.locator("#todayRoleQuestion")).toBeVisible();
  await expect(page.locator('[data-testid="today-attention-list"]')).toBeAttached();
  await expect(page.locator('[data-testid="today-page"]')).toBeVisible();
});

test("today object cards are collapsed and can be expanded", async ({ page }) => {
  await openApp(page, "/today");
  const firstCard = page.locator('[data-today-project-card]').first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard.locator('[data-testid="today-object-details"]')).toHaveCount(0);

  const toggle = firstCard.locator("[data-toggle-today-project]");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveText(/Развернуть/);
  await toggle.click();

  await expect(firstCard.locator('[data-testid="today-object-details"]')).toBeVisible();
  await expect(toggle).toHaveText(/Свернуть/);
  await toggle.click();
  await expect(firstCard.locator('[data-testid="today-object-details"]')).toHaveCount(0);
});
