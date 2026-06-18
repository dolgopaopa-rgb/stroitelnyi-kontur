import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 375, height: 812 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
]) {
  test(`mobile layout ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openApp(page, "/today");
    await expect(page.locator('[data-testid="mobile-bottom-nav"]')).toBeVisible();
    await expect(page.locator(".today-grid")).toBeVisible();
    await expect
      .poll(async () => {
        try {
          return await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 4);
        } catch {
          return true;
        }
      })
      .toBeFalsy();
    const layout = await page.evaluate(() => {
      const visible = (node: Element) => {
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && node.getClientRects().length > 0;
      };
      const gridChildren = [...document.querySelectorAll(".today-grid > *")]
        .filter(visible)
        .map((node) => Math.round((node as HTMLElement).getBoundingClientRect().width));
      const decisionCards = [...document.querySelectorAll(".attention-item.decision-item")]
        .filter(visible)
        .map((node) => Math.round((node as HTMLElement).getBoundingClientRect().width));
      return {
        viewport: window.innerWidth,
        minGridChildWidth: gridChildren.length ? Math.min(...gridChildren) : 0,
        minDecisionWidth: decisionCards.length ? Math.min(...decisionCards) : window.innerWidth,
      };
    });
    expect(layout.minGridChildWidth, `today-grid child width at ${viewport.width}x${viewport.height}`).toBeGreaterThan(Math.min(300, viewport.width - 40));
    expect(layout.minDecisionWidth, `decision card width at ${viewport.width}x${viewport.height}`).toBeGreaterThan(Math.min(300, viewport.width - 40));

    await openApp(page, "/estimates");
    await expect(page.locator('[data-testid="mobile-bottom-nav"]')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const estimatesLayout = await page.evaluate(() => {
      const nav = document.querySelector('[data-testid="mobile-bottom-nav"]') as HTMLElement | null;
      const row = [...document.querySelectorAll(".estimate-job-row")].pop() as HTMLElement | undefined;
      const navTop = nav?.getBoundingClientRect().top ?? window.innerHeight;
      const rowBottom = row?.getBoundingClientRect().bottom ?? 0;
      return {
        hasRows: Boolean(row),
        rowBottom,
        navTop,
        overlapped: Boolean(row && rowBottom > navTop + 2),
      };
    });
    expect(estimatesLayout.overlapped, `estimate row should not be hidden by bottom nav: ${JSON.stringify(estimatesLayout)}`).toBeFalsy();
  });
}
