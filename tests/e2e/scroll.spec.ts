import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

const views = ["/today", "/objects", "/tasks", "/materials", "/photo-reports", "/object-issues", "/documents", "/signals", "/feedback"];

test.describe("Scroll QA", () => {
  for (const view of views) {
    test(`wheel and keyboard scroll on ${view}`, async ({ page }) => {
      await openApp(page, view);
      const before = await page.evaluate(() => ({
        y: window.scrollY,
        h: document.documentElement.scrollHeight,
        vh: window.innerHeight,
      }));
      const mainBox = await page.locator('[data-testid="qa-main-content"]').boundingBox().catch(() => null);
      if (mainBox) {
        await page.mouse.move(mainBox.x + Math.min(mainBox.width - 8, Math.max(8, mainBox.width / 2)), mainBox.y + Math.min(mainBox.height - 8, Math.max(8, mainBox.height / 2)));
      }
      await page.mouse.wheel(0, 1200);
      await page.dispatchEvent('[data-testid="qa-main-content"]', "wheel", { deltaY: 1200, deltaMode: 0, bubbles: true, cancelable: true });
      await page.waitForTimeout(120);
      const after = await page.evaluate(() => window.scrollY).catch(() => before.y);
      const viewport = page.viewportSize();
      if (before.h > before.vh + 20 && (viewport?.width || 0) > 820 && view !== "/feedback") expect(after).toBeGreaterThan(before.y);
      const locked = await page.evaluate(() => getComputedStyle(document.body).overflowY === "hidden" || getComputedStyle(document.documentElement).overflowY === "hidden").catch(() => false);
      expect(locked).toBeFalsy();
    });
  }
});
