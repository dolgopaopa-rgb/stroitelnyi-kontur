import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("object list controls remain reachable across tablet breakpoints", async ({ page }) => {
  await openApp(page, "/objects");
  for (const width of [320, 390, 720, 721, 768, 820, 832, 1024, 1100, 1101, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const selector of [
      '[data-project-list="active"]',
      '[data-project-list="archive"]',
      '[data-project-display="table"]',
      '[data-project-display="cards"]',
    ]) {
      const control = page.locator(selector);
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box, `${selector} at ${width}px`).not.toBeNull();
      expect(box!.x, `${selector} must not disappear left at ${width}px`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${selector} must fit at ${width}px`).toBeLessThanOrEqual(width + 1);
      await control.click({ trial: true });
    }
  }
  await page.locator('[data-project-list="archive"]').click();
  await expect(page.locator('[data-project-list="archive"]')).toHaveClass(/active/);
  await page.locator('[data-project-list="active"]').click();
  await expect(page.locator('[data-project-list="active"]')).toHaveClass(/active/);
});

test("mobile full menu opens and closes every available section", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/today");
  await page.locator("#mobileMoreButton").click();
  const views = await page.locator("[data-mobile-menu-item]").evaluateAll((buttons) =>
    buttons.map((button) => (button as HTMLElement).dataset.mobileMenuItem!)
  );
  expect(views.length).toBeGreaterThan(0);
  for (let i = 0; i < views.length; i += 1) {
    if (i) await page.locator("#mobileMoreButton").click();
    await page.locator(`[data-mobile-menu-item="${views[i]}"]`).click();
    await expect(page.locator(`#${views[i]}View`)).toHaveClass(/active/);
    await expect(page.locator("#mobileQuickSheet")).toBeHidden();
  }
});
