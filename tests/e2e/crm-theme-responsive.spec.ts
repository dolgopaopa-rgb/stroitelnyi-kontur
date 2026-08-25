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
        const pageTitle = document.querySelector<HTMLElement>("#pageTitle");
        const overflowingElements = [...document.querySelectorAll<HTMLElement>("body *")]
          .filter(visible)
          .map((node) => {
            const rect = node.getBoundingClientRect();
            return {
              tag: node.tagName.toLowerCase(),
              id: node.id,
              className: typeof node.className === "string" ? node.className : "",
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              scrollWidth: node.scrollWidth,
            };
          })
          .filter((item) => item.left < -1 || item.right > window.innerWidth + 1)
          .slice(0, 20);
        return {
          font: getComputedStyle(document.body).fontFamily,
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
          clippedCommands,
          smallTouchTargets,
          sidebarVisible: Boolean(sidebar && visible(sidebar)),
          mobileNavVisible: Boolean(mobileNav && visible(mobileNav)),
          themeLoaded: [...document.styleSheets].some((sheet) => String(sheet.href || "").includes("crm-theme.css")),
          titleFits: !pageTitle || pageTitle.scrollWidth <= pageTitle.clientWidth + 1,
          titleMetrics: pageTitle ? {
            text: pageTitle.textContent?.trim(),
            clientWidth: pageTitle.clientWidth,
            scrollWidth: pageTitle.scrollWidth,
            fontSize: getComputedStyle(pageTitle).fontSize,
          } : null,
          overflowingElements,
        };
      });

      expect(geometry.themeLoaded, `${route} at ${width}px must load crm-theme.css`).toBeTruthy();
      expect(geometry.font, `${route} at ${width}px must use Involve`).toContain("Involve");
      expect(geometry.titleFits, `${route} at ${width}px has a clipped page title: ${JSON.stringify(geometry.titleMetrics)}`).toBeTruthy();
      expect(
        geometry.overflow,
        `${route} at ${width}px has horizontal overflow: ${JSON.stringify(geometry.overflowingElements)}`,
      ).toBeLessThanOrEqual(1);
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

test("manager shell and compact workspaces keep a shared alignment", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "Desktop geometry is checked once.");
  await page.addInitScript(() => Reflect.deleteProperty(Navigator.prototype, "serviceWorker"));
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page, "/today");
  const role = page.locator("#currentRoleSelect");
  if (await role.locator('option[value="sales_manager"]').count()) {
    await role.selectOption("sales_manager");
    await page.waitForTimeout(300);
  }

  const todayGeometry = await page.evaluate(() => {
    const center = (rect: DOMRect, axis: "x" | "y") => axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
    const toggle = document.querySelector<HTMLElement>("#sidebarToggle")!.getBoundingClientRect();
    const toggleIcon = document.querySelector<SVGElement>("#sidebarToggle svg")!.getBoundingClientRect();
    const brand = document.querySelector<HTMLElement>(".sidebar .brand")!.getBoundingClientRect();
    const mark = document.querySelector<HTMLElement>(".brand-mark-wrap")!.getBoundingClientRect();
    const title = document.querySelector<HTMLElement>("#pageTitle")!.getBoundingClientRect();
    const panels = [...document.querySelectorAll<HTMLElement>('#todayView[data-role="sales_manager"] .today-grid > .panel')]
      .filter((node) => !node.hidden && getComputedStyle(node).display !== "none")
      .map((node) => node.getBoundingClientRect());
    const controls = [...document.querySelectorAll<HTMLElement>(".topbar .actions label")]
      .filter((node) => getComputedStyle(node).display !== "none");
    return {
      toggleIconX: Math.abs(center(toggle, "x") - center(toggleIcon, "x")),
      toggleIconY: Math.abs(center(toggle, "y") - center(toggleIcon, "y")),
      brandMarkY: Math.abs(center(brand, "y") - center(mark, "y")),
      titleY: Math.abs(center(toggle, "y") - center(title, "y")),
      controlsCentered: controls.every((node) => getComputedStyle(node).textAlign === "center"),
      visiblePanels: panels.length,
      firstRowTopDelta: panels.length > 1 ? Math.abs(panels[0].top - panels[1].top) : 999,
      firstRowWidthDelta: panels.length > 1 ? Math.abs(panels[0].width - panels[1].width) : 999,
      activePanelIsWide: panels.length > 2 ? panels[2].width > panels[0].width * 1.8 : false,
      objectColumns: getComputedStyle(document.querySelector<HTMLElement>("#todayObjects")!).gridTemplateColumns.split(" ").length,
    };
  });

  expect(todayGeometry.toggleIconX).toBeLessThanOrEqual(1);
  expect(todayGeometry.toggleIconY).toBeLessThanOrEqual(1);
  expect(todayGeometry.brandMarkY).toBeLessThanOrEqual(2);
  expect(todayGeometry.titleY).toBeLessThanOrEqual(3);
  expect(todayGeometry.controlsCentered).toBeTruthy();
  expect(todayGeometry.visiblePanels).toBe(3);
  expect(todayGeometry.firstRowTopDelta).toBeLessThanOrEqual(1);
  expect(todayGeometry.firstRowWidthDelta).toBeLessThanOrEqual(2);
  expect(todayGeometry.activePanelIsWide).toBeTruthy();
  expect(todayGeometry.objectColumns).toBe(3);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>(".main")?.scrollTo(0, 0);
  });
  await page.screenshot({ path: testInfo.outputPath("manager-today-compact-1440.png"), fullPage: true });

  await openApp(page, "/signals");
  const signalGeometry = await page.evaluate(() => {
    const metrics = [...document.querySelectorAll<HTMLElement>("#summaryCards .metric")];
    const heights = metrics.map((node) => node.getBoundingClientRect().height);
    const numberFonts = metrics.map((node) => getComputedStyle(node.querySelector("strong")!).fontFamily);
    const mainWidth = document.querySelector<HTMLElement>(".main")!.getBoundingClientRect().width;
    const notificationWidth = document.querySelector<HTMLElement>("#dashboardView .notifications-panel")!.getBoundingClientRect().width;
    return { count: metrics.length, heights, numberFonts, mainWidth, notificationWidth };
  });
  expect(signalGeometry.count).toBeGreaterThan(0);
  expect(Math.max(...signalGeometry.heights)).toBeLessThanOrEqual(52);
  expect(signalGeometry.numberFonts.every((font) => font.includes("Involve"))).toBeTruthy();
  expect(signalGeometry.notificationWidth).toBeLessThan(signalGeometry.mainWidth * 0.5);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>(".main")?.scrollTo(0, 0);
  });
  await page.screenshot({ path: testInfo.outputPath("manager-signals-compact-1440.png"), fullPage: true });
});

test("estimate attachments stay collapsed and open as compact tiles", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "Estimate density is checked once.");
  await page.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, "serviceWorker");
    const nativeSetInterval = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 10_000) return 0;
      return nativeSetInterval(handler, timeout, ...args);
    }) as typeof window.setInterval;
  });
  await page.route("**/api/estimate-jobs", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 901,
          title: "Тестовая смета для проверки компактных вложений",
          customer_name: "Тестовый заказчик",
          project_title: "Тестовый объект",
          estimate_type: "primary",
          status: "estimate_in_work",
          received_at: "2026-08-20",
          due_date: "2026-08-28",
          manager_name: "Менеджер",
          estimator_name: "Сметчик",
          site_costs_policy: "include",
          files: [
            { id: 1, title: "Смета.pdf", file_name: "estimate.pdf", mime_type: "application/pdf", version_no: 1, is_current: 1 },
            { id: 2, title: "План первого этажа", file_name: "floor-1.jpg", mime_type: "image/jpeg", version_no: 1, is_current: 1 },
            { id: 3, title: "План второго этажа", file_name: "floor-2.jpg", mime_type: "image/jpeg", version_no: 1, is_current: 1 },
            { id: 4, title: "Ведомость.xlsx", file_name: "materials.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", version_no: 1, is_current: 1 },
          ],
        },
      ]),
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?view=estimates", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#estimatesView")).toHaveClass(/active/);
  const group = page.getByTestId("estimate-files-group");
  await expect(group).toHaveCount(1);
  await expect(group).not.toHaveAttribute("open", "");
  const collapsedRowHeight = await page.locator(".estimate-job-row").evaluate((node) => node.getBoundingClientRect().height);
  expect(collapsedRowHeight).toBeLessThan(190);

  await group.locator("summary").click();
  await expect(group).toHaveAttribute("open", "");
  await expect(group.locator(".estimate-file-card")).toHaveCount(4);
  const tileSizes = await group.locator(".estimate-file-card").evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  expect(tileSizes.every((tile) => tile.width <= 220 && tile.height <= 150)).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("estimates-compact-files-1440.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileRole = page.locator("#currentRoleSelect");
  if (await mobileRole.locator('option[value="sales_manager"]').count()) {
    await mobileRole.selectOption("sales_manager");
    await page.waitForTimeout(300);
  }
  const mobileGroup = page.getByTestId("estimate-files-group");
  await expect(mobileGroup).toHaveCount(1);
  await expect(mobileGroup).not.toHaveAttribute("open", "");
  await mobileGroup.locator("summary").click();
  await expect(mobileGroup.locator(".estimate-file-card")).toHaveCount(4);
  const mobileGeometry = await page.evaluate(() => {
    const visible = (node: HTMLElement) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const tiles = [...document.querySelectorAll<HTMLElement>(".estimate-file-card")].map((node) => node.getBoundingClientRect());
    const buttons = [...document.querySelectorAll<HTMLElement>(".estimate-files-group button")]
      .filter(visible)
      .map((node) => node.getBoundingClientRect());
    const overflowingElements = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter(visible)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { tag: node.tagName.toLowerCase(), id: node.id, className: node.className, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
      })
      .filter((item) => item.left < -1 || item.right > window.innerWidth + 1)
      .slice(0, 20);
    return {
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      tileColumns: getComputedStyle(document.querySelector<HTMLElement>(".estimate-job-files")!).gridTemplateColumns.split(" ").length,
      compactTiles: tiles.every((tile) => tile.width <= 180 && tile.height <= 180),
      touchTargets: buttons.every((button) => button.width >= 44 && button.height >= 44),
      overflowingElements,
    };
  });
  expect(mobileGeometry.overflow, JSON.stringify(mobileGeometry.overflowingElements)).toBeLessThanOrEqual(1);
  expect(mobileGeometry.tileColumns).toBe(2);
  expect(mobileGeometry.compactTiles).toBeTruthy();
  expect(mobileGeometry.touchTargets).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("estimates-compact-files-390.png"), fullPage: true });
});
