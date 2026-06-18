import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

const views = ["/today", "/objects", "/tasks", "/materials", "/photo-reports", "/object-issues", "/documents", "/signals", "/feedback", "/estimates"];

async function evaluateStable<T>(page, callback: () => T | Promise<T>): Promise<T> {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await page.evaluate(callback);
    } catch (error) {
      lastError = error;
      if (!String(error).includes("Execution context was destroyed")) throw error;
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(250);
    }
  }
  throw lastError;
}

async function scrollMetrics(page) {
  return evaluateStable(page, () => {
    const main = document.querySelector('[data-testid="qa-main-content"]');
    const root = document.querySelector('[data-testid="qa-scroll-root"]');
    const nodes = [document.scrollingElement, document.documentElement, document.body, main, root].filter(Boolean);
    return nodes.map((node) => ({
      tag: (node as Element).tagName || "document",
      scrollTop: (node as Element).scrollTop || 0,
      scrollHeight: (node as Element).scrollHeight || 0,
      clientHeight: (node as Element).clientHeight || 0,
    }));
  });
}

async function resetScroll(page) {
  await evaluateStable(page, () => {
    const main = document.querySelector('[data-testid="qa-main-content"]') as HTMLElement | null;
    const root = document.querySelector('[data-testid="qa-scroll-root"]') as HTMLElement | null;
    for (const node of [document.scrollingElement, document.documentElement, document.body, main, root].filter(Boolean)) {
      (node as Element).scrollTop = 0;
    }
  });
}

test.describe("Scroll QA", () => {
  for (const view of views) {
    test(`wheel and keyboard scroll on ${view}`, async ({ page }) => {
      await openApp(page, view);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(250);
      await resetScroll(page);
      const before = await scrollMetrics(page);
      const mainBox = await page.locator('[data-testid="qa-main-content"]').boundingBox().catch(() => null);
      if (mainBox) {
        await page.mouse.move(mainBox.x + Math.min(mainBox.width - 8, Math.max(8, mainBox.width / 2)), mainBox.y + Math.min(mainBox.height - 8, Math.max(8, mainBox.height / 2)));
      }
      await page.mouse.wheel(0, 1200);
      await page.dispatchEvent('[data-testid="qa-main-content"]', "wheel", { deltaY: 1200, deltaMode: 0, bubbles: true, cancelable: true });
      await page.keyboard.press("PageDown").catch(() => {});
      await page.waitForTimeout(120);
      const after = await scrollMetrics(page).catch(async () => {
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        return scrollMetrics(page);
      });
      const viewport = page.viewportSize();
      const scrollable = before.some((item) => item.scrollHeight > item.clientHeight + 20);
      const moved = after.some((item, index) => item.scrollTop > (before[index]?.scrollTop || 0));
      if (scrollable && (viewport?.width || 0) > 820 && view !== "/feedback") expect(moved).toBeTruthy();
      const locked = await page.evaluate(() => getComputedStyle(document.body).overflowY === "hidden" || getComputedStyle(document.documentElement).overflowY === "hidden").catch(() => false);
      expect(locked).toBeFalsy();
    });
  }
});
