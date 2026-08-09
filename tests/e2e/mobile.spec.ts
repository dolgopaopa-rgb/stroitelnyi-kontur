import { expect, Page, test } from "@playwright/test";
import path from "node:path";
import { openApp } from "../helpers/auth";

async function swipePageUp(page: Page) {
  const session = await page.context().newCDPSession(page);
  try {
    const point = (y: number) => ({ x: 300, y, id: 1, radiusX: 6, radiusY: 6, force: 1 });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point(700)],
    });
    await page.waitForTimeout(80);
    for (const y of [640, 570, 500, 430, 360, 290, 220]) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(y)] });
      await page.waitForTimeout(70);
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await session.detach();
  }
  await page.waitForTimeout(250);
}

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
    await expect(page.locator('[data-testid="mobile-more-button"]')).toBeVisible();
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

    await page.waitForLoadState("networkidle").catch(() => undefined);
    let feedbackMenuVisible = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.locator('[data-testid="mobile-more-button"]').click().catch(() => undefined);
      await page.waitForTimeout(350);
      feedbackMenuVisible = await page.locator('[data-mobile-menu-item="feedback"]').isVisible().catch(() => false);
      if (feedbackMenuVisible) break;
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    }
    expect(feedbackMenuVisible, "Feedback must be reachable from mobile More menu").toBeTruthy();
    await page.locator('[data-mobile-menu-item="feedback"]').click();
    await expect(page.locator("#feedbackView")).toHaveClass(/active/);

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

test("estimate list touch-scrolls before and after closing its modal", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Dedicated 390x844 touch scenario");
  await page.setViewportSize({ width: 390, height: 844 });
  const jobs = Array.from({ length: 14 }, (_, index) => ({
    id: 7000 + index,
    title: `Мобильная проверка сметы ${index + 1}`,
    customer_name: `Заказчик ${index + 1}`,
    manager_id: 1,
    manager_name: "Менеджер QA",
    estimator_id: 2,
    estimator_name: "Сметчик QA",
    received_at: "2026-08-09",
    due_date: "2026-08-20",
    status: "estimate_new",
    estimate_type: "primary",
    site_costs_policy: "include",
    files: [{ id: 9000 + index, file_name: `plan-${index + 1}.pdf`, is_current: 1 }],
  }));
  await page.route("**/api/estimate-jobs", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(jobs) });
      return;
    }
    await route.continue();
  });
  await openApp(page, "/estimates");
  await page.waitForTimeout(1800);
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await expect(page.locator('[data-testid="estimates-page"]')).toHaveClass(/active/);

  const cards = page.locator('[data-testid="estimate-job-card"]');
  expect(await cards.count(), "Estimate touch-scroll scenario requires real cards").toBeGreaterThan(0);
  await page.screenshot({
    path: path.resolve("qa-artifacts", "latest", "screenshots", "estimates-mobile-390.png"),
    fullPage: true,
  });
  const initialMetrics = await page.evaluate(() => ({
    height: document.scrollingElement?.scrollHeight || 0,
    viewport: window.innerHeight,
  }));
  expect(initialMetrics.height, "Estimate list must be taller than the mobile viewport").toBeGreaterThan(initialMetrics.viewport + 100);

  await page.evaluate(() => {
    (window as any).__qaTouchEvents = [];
    for (const type of ["touchstart", "touchmove", "touchend"]) {
      document.addEventListener(type, () => (window as any).__qaTouchEvents.push(type), { passive: true });
    }
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await swipePageUp(page);
  const touchEvents = await page.evaluate(() => (window as any).__qaTouchEvents);
  expect(touchEvents, "CDP gesture must emit touch events").toContain("touchmove");
  await expect.poll(() => page.evaluate(() => window.scrollY || document.scrollingElement?.scrollTop || 0)).toBeGreaterThan(40);

  await page.locator("#newEstimateJobButton").click();
  await expect(page.locator("#estimateJobDialog")).toHaveAttribute("open", "");
  await page.locator('#estimateJobDialog [data-close="estimateJobDialog"]').first().click();
  await expect(page.locator("#estimateJobDialog")).not.toHaveAttribute("open", "");

  await page.evaluate(() => window.scrollTo(0, 0));
  await swipePageUp(page);
  await expect.poll(() => page.evaluate(() => window.scrollY || document.scrollingElement?.scrollTop || 0)).toBeGreaterThan(40);
  const overflow = await page.evaluate(() => ({
    body: getComputedStyle(document.body).overflowY,
    html: getComputedStyle(document.documentElement).overflowY,
  }));
  expect(overflow.body).not.toBe("hidden");
  expect(overflow.html).not.toBe("hidden");
});
