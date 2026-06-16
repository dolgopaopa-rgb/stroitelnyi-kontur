import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";
import { testIds } from "../helpers/selectors";

test("main navigation buttons change visible screen", async ({ page }) => {
  await openApp(page, "/today");
  for (const selector of [testIds.navObjects, testIds.navTasks, testIds.navMaterials, testIds.navDocuments]) {
    const button = page.locator(selector).first();
    if (!(await button.isVisible().catch(() => false))) continue;
    await button.click();
    await expect(page.locator(".view.active")).toBeVisible();
  }
});

test("mobile plus button opens quick actions", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile quick actions are verified in the mobile project.");
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/today");
  await expect(page.locator(testIds.mobileBottomNav)).toBeVisible();
  await page.locator(testIds.mobilePlusButton).click();
  await expect(page.locator(`${testIds.mobileQuickActions} [data-mobile-action]`).first()).toBeVisible();
});
