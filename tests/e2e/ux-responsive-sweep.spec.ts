import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { openApp, switchRole } from "../helpers/auth";

const widths = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920];

test("today workspace has no major responsive defects across the Rada matrix", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "One controlled browser is enough for the width matrix");
  test.setTimeout(120_000);
  const evidenceDir = path.resolve("qa-snapshots/ux-reset-after/responsive");
  fs.mkdirSync(evidenceDir, { recursive: true });

  await openApp(page, "/today");
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await switchRole(page, "owner")).toBeTruthy();

  for (const width of widths) {
    const height = width <= 430 ? 844 : width <= 768 ? 1024 : 900;
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    const result = await page.evaluate(() => {
      const visible = (node: Element) => {
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && node.getClientRects().length > 0;
      };
      const offenders = [...document.querySelectorAll(".main, .topbar, #todayView, .workspace-context, .compact-kpi, .panel, .row, .attention-item, .mobile-bottom-nav")]
        .filter(visible)
        .filter((node) => {
          const box = node.getBoundingClientRect();
          return box.left < -2 || box.right > window.innerWidth + 2;
        })
        .map((node) => `${node.tagName.toLowerCase()}.${(node as HTMLElement).className}`)
        .slice(0, 10);
      const bottomNav = document.querySelector(".mobile-bottom-nav");
      const bottomBox = bottomNav && visible(bottomNav) ? bottomNav.getBoundingClientRect() : null;
      return {
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        offenders,
        bottomNavTop: bottomBox?.top || null,
      };
    });
    expect(result.scrollWidth, `No horizontal page overflow at ${width}px`).toBeLessThanOrEqual(result.viewport + 2);
    expect(result.offenders, `Visible workspace elements must fit at ${width}px`).toEqual([]);
    if (width <= 980) {
      await expect(page.getByTestId("mobile-bottom-nav").locator("button:visible")).toHaveCount(5);
      const plus = page.getByTestId("mobile-plus-button");
      const left = page.locator("#mobileRolePrimaryNav");
      const right = page.locator("#mobileRoleSecondaryNav");
      const [plusBox, leftBox, rightBox] = await Promise.all([plus.boundingBox(), left.boundingBox(), right.boundingBox()]);
      expect(plusBox && leftBox && rightBox).toBeTruthy();
      expect((plusBox?.x || 0) - ((leftBox?.x || 0) + (leftBox?.width || 0))).toBeGreaterThanOrEqual(0);
      expect((rightBox?.x || 0) - ((plusBox?.x || 0) + (plusBox?.width || 0))).toBeGreaterThanOrEqual(0);
    }
    await page.screenshot({ path: path.join(evidenceDir, `today-${width}.png`), fullPage: true });
  }
});
