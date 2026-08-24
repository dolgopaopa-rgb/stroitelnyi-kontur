import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test.use({ serviceWorkers: "block" });

const viewports = [
  { width: 390, height: 844 },
  { width: 720, height: 900 },
  { width: 721, height: 900 },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
  { width: 1080, height: 900 },
  { width: 1081, height: 900 },
  { width: 1220, height: 900 },
  { width: 1221, height: 900 },
  { width: 1234, height: 900 },
  { width: 1280, height: 900 },
  { width: 1440, height: 900 },
];

type Rect = { left: number; top: number; right: number; bottom: number };

function overlaps(first: Rect, second: Rect) {
  return first.left < second.right - 1 && first.right > second.left + 1 && first.top < second.bottom - 1 && first.bottom > second.top + 1;
}

test("desktop shell keeps the sidebar text contained and the topbar aligned", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await openApp(page, "/today");
    await page.locator("#installAppButton").evaluate((button) => {
      button.hidden = false;
      button.textContent = "Установить";
    });

    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(horizontalOverflow, viewport.width + "px: page overflow").toBeLessThanOrEqual(1);

    if (viewport.width > 980) {
      const feedbackBounds = await page.locator('[data-testid="nav-feedback"]').evaluate((button) => {
        const buttonRect = button.getBoundingClientRect();
        const sidebarRect = button.closest(".sidebar")?.getBoundingClientRect();
        const labelRect = button.querySelector("span:last-child")?.getBoundingClientRect();
        const label = button.querySelector("span:last-child") as HTMLElement | null;
        return {
          buttonRight: buttonRect.right,
          sidebarRight: sidebarRect?.right ?? 0,
          labelRight: labelRect?.right ?? 0,
          labelClientWidth: label?.clientWidth ?? 0,
          labelScrollWidth: label?.scrollWidth ?? 0,
          labelClientHeight: label?.clientHeight ?? 0,
          labelScrollHeight: label?.scrollHeight ?? 0,
        };
      });
      expect(feedbackBounds.buttonRight, viewport.width + "px: feedback button").toBeLessThanOrEqual(feedbackBounds.sidebarRight + 1);
      expect(feedbackBounds.labelRight, viewport.width + "px: feedback label").toBeLessThanOrEqual(feedbackBounds.sidebarRight + 1);
      expect(feedbackBounds.labelScrollWidth, viewport.width + "px: feedback label width").toBeLessThanOrEqual(feedbackBounds.labelClientWidth + 1);
      expect(feedbackBounds.labelScrollHeight, viewport.width + "px: feedback label height").toBeLessThanOrEqual(feedbackBounds.labelClientHeight + 1);
    }

    const topbar = page.locator(".topbar");
    await expect(topbar).toBeVisible();
    const actionBounds = await page.locator(".topbar .actions > *").evaluateAll((elements) =>
      elements
        .filter((element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && rect.width > 0 && rect.height > 0;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            name: (element as HTMLElement).id || String(element.className) || element.tagName,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          };
        }),
    );

    for (let index = 0; index < actionBounds.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < actionBounds.length; otherIndex += 1) {
        const first = actionBounds[index];
        const second = actionBounds[otherIndex];
        expect(overlaps(first, second), viewport.width + "px: " + first.name + " overlaps " + second.name).toBeFalsy();
      }
    }

    const topbarRect = await topbar.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    const shellBounds = await page.locator(".topbar > *, .topbar .actions > *").evaluateAll((elements) =>
      elements
        .filter((element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && rect.width > 0 && rect.height > 0;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            name: (element as HTMLElement).id || String(element.className) || element.tagName,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          };
        }),
    );
    for (const item of shellBounds) {
      expect(item.left, viewport.width + "px: " + item.name + " left").toBeGreaterThanOrEqual(topbarRect.left - 1);
      expect(item.right, viewport.width + "px: " + item.name + " right").toBeLessThanOrEqual(topbarRect.right + 1);
      expect(item.top, viewport.width + "px: " + item.name + " top").toBeGreaterThanOrEqual(topbarRect.top - 1);
      expect(item.bottom, viewport.width + "px: " + item.name + " bottom").toBeLessThanOrEqual(topbarRect.bottom + 1);
    }

    if (viewport.width >= 1221) {
      const controls = actionBounds.map((item) => Math.round(item.bottom));
      expect(Math.max(...controls) - Math.min(...controls), viewport.width + "px: control baseline").toBeLessThanOrEqual(2);
      const topbarHeight = await topbar.evaluate((element) => element.getBoundingClientRect().height);
      expect(topbarHeight, viewport.width + "px: compact topbar height").toBeLessThanOrEqual(66);
    }
  }
});