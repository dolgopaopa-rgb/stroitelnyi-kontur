import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

const widths = [320, 360, 390, 430, 768, 1024, 1280, 1440];
const routes = ["/today", "/signals", "/objects", "/tasks", "/photo-reports"];

test("CRM theme stays usable from 320 to 1440 px", async ({ page }, testInfo) => {
  const artifactDir = testInfo.outputPath("crm-theme");

  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });

    for (const route of routes) {
      await openApp(page, route);
      await page.waitForTimeout(120);

      const geometry = await page.evaluate(() => {
        const visible = (node: Element) => {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        const commandSelector = ".primary,.secondary,.danger-button,.link-button,.nav-button,.mobile-bottom-nav button";
        const clippedCommands = [...document.querySelectorAll<HTMLElement>(commandSelector)]
          .filter(visible)
          .filter((node) => {
            if (!node.textContent?.trim()) return false;
            const rect = node.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(node);
            const textRect = range.getBoundingClientRect();
            return textRect.left < rect.left - 1 || textRect.right > rect.right + 1 || textRect.top < rect.top - 1 || textRect.bottom > rect.bottom + 1;
          })
          .map((node) => node.textContent?.trim().replace(/\s+/g, " ").slice(0, 80));
        const smallTouchTargets = [...document.querySelectorAll<HTMLElement>(commandSelector)]
          .filter(visible)
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width < 44 || rect.height < 44;
          })
          .map((node) => `${node.textContent?.trim().replace(/\s+/g, " ").slice(0, 40)}:${Math.round(node.getBoundingClientRect().width)}x${Math.round(node.getBoundingClientRect().height)}`);
        const sidebar = document.querySelector<HTMLElement>(".sidebar");
        const mobileNav = document.querySelector<HTMLElement>(".mobile-bottom-nav");
        return {
          font: getComputedStyle(document.body).fontFamily,
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
          clippedCommands,
          smallTouchTargets,
          sidebarVisible: Boolean(sidebar && visible(sidebar)),
          mobileNavVisible: Boolean(mobileNav && visible(mobileNav)),
          themeLoaded: [...document.styleSheets].some((sheet) => String(sheet.href || "").includes("crm-theme.css")),
        };
      });

      expect(geometry.themeLoaded, `${route} at ${width}px must load crm-theme.css`).toBeTruthy();
      expect(geometry.font, `${route} at ${width}px must use Involve`).toContain("Involve");
      expect(geometry.overflow, `${route} at ${width}px has horizontal overflow`).toBeLessThanOrEqual(1);
      expect(geometry.clippedCommands, `${route} at ${width}px has clipped button text`).toEqual([]);
      expect(geometry.sidebarVisible, `${route} at ${width}px desktop sidebar state`).toBe(width > 820);
      expect(geometry.mobileNavVisible, `${route} at ${width}px mobile navigation state`).toBe(width <= 820);
      if (width <= 820) {
        expect(geometry.smallTouchTargets, `${route} at ${width}px has touch targets below 44px`).toEqual([]);
      }
    }

    await openApp(page, "/today");
    await page.screenshot({ path: `${artifactDir}-${width}.png`, fullPage: true });
  }
});

test("login uses the same CRM theme and keeps password controls inside", async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
    await page.goto("/static/login.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".login-card")).toBeVisible();
    await expect(page.locator("#loginTitle")).toHaveText("Контур Д²ДОМ");
    await page.waitForTimeout(800);
    await page.waitForLoadState("domcontentloaded");
    const result = await page.evaluate(() => ({
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      font: getComputedStyle(document.body).fontFamily,
      clipped: [...document.querySelectorAll<HTMLElement>(".password-tool")].filter((button) => button.scrollWidth > button.clientWidth + 1),
    }));
    expect(result.overflow).toBeLessThanOrEqual(1);
    expect(result.font).toContain("Involve");
    expect(result.clipped).toEqual([]);
  }
});

test("manager workspace passes the continuous 320-1440 px sweep", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "Continuous sweep runs once in the desktop project.");
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page, "/today");
  const role = page.locator("#currentRoleSelect");
  if (await role.locator('option[value="sales_manager"]').count()) {
    await role.selectOption("sales_manager");
    await page.waitForTimeout(300);
  }

  for (let width = 320; width <= 1440; width += 16) {
    await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
    await page.waitForTimeout(20);
    const result = await page.evaluate(() => {
      const title = document.querySelector<HTMLElement>("#pageTitle");
      const main = document.querySelector<HTMLElement>(".main");
      const mainRect = main?.getBoundingClientRect();
      return {
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
        titleFits: !title || title.scrollWidth <= title.clientWidth + 1,
        mainInsideViewport: !mainRect || (mainRect.left >= -1 && mainRect.right <= window.innerWidth + 1),
      };
    });
    expect(result.overflow, `manager Today at ${width}px has horizontal overflow`).toBeLessThanOrEqual(1);
    expect(result.titleFits, `manager Today title is clipped at ${width}px`).toBeTruthy();
    expect(result.mainInsideViewport, `manager Today main leaves viewport at ${width}px`).toBeTruthy();
  }
});
