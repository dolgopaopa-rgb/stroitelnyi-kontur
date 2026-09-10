import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test.use({ serviceWorkers: "block" });

test("approved CRM brand system is applied to the working shell", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const asset of [
    "/static/crm-theme.css",
    "/static/assets/d2dom-logo-white.svg",
    "/static/assets/d2dom-logo-tile.svg",
    "/static/assets/fonts/Haval-Light.woff2",
    "/static/assets/fonts/Involve-Regular.woff2",
    "/static/assets/fonts/Involve-SemiBold.woff2",
  ]) {
    const response = await request.get(asset);
    expect(response.ok(), `${asset} must be available`).toBeTruthy();
  }

  await openApp(page, "/today");
  await expect(page.locator("body")).toHaveClass(/compact-ui-v1/);
  await expect(page.locator('link[rel="stylesheet"][href^="/static/crm-theme.css"]')).toHaveCount(1);
  await expect(page.locator('link[rel="stylesheet"][href*="brand-2026.css"]')).toHaveCount(0);
  await expect(page.locator(".sidebar .brand-copy span")).toHaveText("Д²ДОМ · строительство");
  await expect(page.locator(".sidebar .brand-copy strong")).toHaveText("Контур");
  await expect(page.locator(".sidebar .brand-mark-wrap")).toBeVisible();
  await expect(page.locator("#todayView .today-grid > .panel").first()).toBeVisible();
  const loadedFonts = await page.evaluate(async () => {
    const faces = await Promise.all([
      document.fonts.load('400 15px "Involve"'),
      document.fonts.load('600 15px "Involve"'),
      document.fonts.load('300 26px "Haval"'),
    ]);
    await document.fonts.ready;
    return faces.map((group) => group.length > 0 && group.every((face) => face.status === "loaded"));
  });
  expect(loadedFonts, "the actual CRM font files must decode").toEqual([true, true, true]);

  const shell = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const sidebar = getComputedStyle(document.querySelector(".sidebar") as HTMLElement);
    const activeNav = getComputedStyle(document.querySelector(".nav-button.active") as HTMLElement);
    const panel = getComputedStyle(document.querySelector("#todayView .today-grid > .panel") as HTMLElement);
    const primaryStyle = getComputedStyle(document.querySelector(".topbar .primary") as HTMLElement);
    const root = getComputedStyle(document.documentElement);
    const mark = document.querySelector(".brand-mark-wrap") as HTMLElement;
    const markStyle = getComputedStyle(mark);
    const logo = mark.querySelector("img") as HTMLImageElement;
    const markRect = mark.getBoundingClientRect();
    const copy = document.querySelector(".brand-copy") as HTMLElement;
    const copyRect = copy.getBoundingClientRect();
    const sidebarRect = document.querySelector(".sidebar")!.getBoundingClientRect();
    const mainRect = document.querySelector(".main")!.getBoundingClientRect();
    const navRects = [...document.querySelectorAll<HTMLElement>(".sidebar .nav-button")]
      .filter((node) => node.checkVisibility())
      .map((node) => node.getBoundingClientRect());
    return {
      tokens: Object.fromEntries(["--bg", "--surface", "--surface-strong", "--text", "--brand"].map((name) => [name, root.getPropertyValue(name).trim()])),
      bodyFont: body.fontFamily,
      titleFont: getComputedStyle(copy.querySelector("strong")!).fontFamily,
      bodyBackground: body.backgroundColor,
      sidebarBackground: sidebar.backgroundColor,
      activeNavBackground: activeNav.backgroundColor,
      panelBackground: panel.backgroundColor,
      panelRadius: Number.parseFloat(panel.borderRadius),
      primaryBackground: primaryStyle.backgroundColor,
      logoDecoded: logo.complete && logo.naturalWidth > 0,
      logoMask: markStyle.maskImage,
      logoColor: markStyle.backgroundColor,
      brandGap: copyRect.left - markRect.right,
      brandRight: copyRect.right,
      sidebarRight: sidebarRect.right,
      mainLeft: mainRect.left,
      navWithinSidebar: navRects.length > 0 && navRects.every((rect) => rect.left >= sidebarRect.left && rect.right <= sidebarRect.right && rect.height >= 42),
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

  expect(shell.tokens).toEqual({ "--bg": "#d9ddd8", "--surface": "#eceeea", "--surface-strong": "#f7f8f5", "--text": "#282d2f", "--brand": "#7b0d18" });
  expect(shell.bodyFont).toContain("Involve");
  expect(shell.titleFont).toContain("Haval");
  expect(shell.bodyBackground).toBe("rgb(217, 221, 216)");
  expect(shell.sidebarBackground).toBe("rgba(236, 238, 234, 0.97)");
  expect(shell.activeNavBackground).toBe("rgb(123, 13, 24)");
  expect(shell.panelBackground).toBe("rgba(236, 238, 234, 0.88)");
  expect(shell.panelRadius).toBe(14);
  expect(shell.primaryBackground).toBe("rgb(123, 13, 24)");
  expect(shell.logoDecoded).toBeTruthy();
  expect(shell.logoMask).toContain("/static/assets/d2dom-logo-white.svg");
  expect(shell.logoColor).toBe("rgb(123, 13, 24)");
  expect(shell.brandGap).toBeGreaterThanOrEqual(8);
  expect(shell.brandRight).toBeLessThanOrEqual(shell.sidebarRight);
  expect(shell.mainLeft).toBeGreaterThanOrEqual(shell.sidebarRight - 1);
  expect(shell.navWithinSidebar).toBeTruthy();
  expect(shell.horizontalOverflow).toBeLessThanOrEqual(1);
});

test("brand system remains readable and separated on a 390px phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/today");

  const bottomNav = page.getByTestId("mobile-bottom-nav");
  await expect(bottomNav).toBeVisible();
  const geometry = await page.evaluate(() => {
    const nav = document.querySelector('[data-testid="mobile-bottom-nav"]') as HTMLElement;
    const buttons = [...nav.querySelectorAll("button")].filter((button) => getComputedStyle(button).display !== "none");
    const plus = nav.querySelector('[data-testid="mobile-plus-button"]') as HTMLElement;
    const topbar = document.querySelector(".topbar") as HTMLElement;
    const pageTitle = document.querySelector("#pageTitle") as HTMLElement;
    const plusIndex = buttons.indexOf(plus as HTMLButtonElement);
    const previous = buttons[plusIndex - 1] as HTMLElement | undefined;
    const next = buttons[plusIndex + 1] as HTMLElement | undefined;
    const plusRect = plus.getBoundingClientRect();
    const previousRect = previous?.getBoundingClientRect();
    const nextRect = next?.getBoundingClientRect();
    const visibleCards = [...document.querySelectorAll(".today-grid > .panel")].filter(
      (node) => getComputedStyle(node).display !== "none" && node.getClientRects().length > 0,
    ) as HTMLElement[];
    return {
      leftGap: previousRect ? plusRect.left - previousRect.right : 0,
      rightGap: nextRect ? nextRect.left - plusRect.right : 0,
      plusWidth: plusRect.width,
      plusHeight: plusRect.height,
      topbarHeight: topbar.getBoundingClientRect().height,
      titleTop: pageTitle.getBoundingClientRect().top,
      minCardWidth: visibleCards.length ? Math.min(...visibleCards.map((card) => card.getBoundingClientRect().width)) : 0,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 4,
    };
  });

  expect(geometry.leftGap).toBeGreaterThanOrEqual(2);
  expect(geometry.rightGap).toBeGreaterThanOrEqual(2);
  expect(geometry.plusWidth).toBeGreaterThanOrEqual(44);
  expect(geometry.plusHeight).toBeGreaterThanOrEqual(44);
  expect(geometry.topbarHeight).toBeLessThanOrEqual(220);
  expect(geometry.titleTop).toBeGreaterThanOrEqual(0);
  expect(geometry.minCardWidth).toBeGreaterThanOrEqual(350);
  expect(geometry.horizontalOverflow).toBeFalsy();
});

test("login page uses the same D2Dom visual language", async ({ page }) => {
  await page.goto("/static/login.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toHaveClass(/brand-system-2026/);
  await expect(page.locator('link[rel="stylesheet"][href^="/static/crm-theme.css"]')).toHaveCount(1);
  await expect(page.locator("#loginTitle")).toHaveText("Контур Д²ДОМ");
  await expect(page.locator(".brand img")).toBeVisible();

  const loginStyles = await page.evaluate(async () => {
    await document.fonts.ready;
    const card = document.querySelector(".login-card") as HTMLElement;
    const cardRect = card.getBoundingClientRect();
    const controls = [...document.querySelectorAll<HTMLElement>("#loginForm input, #loginForm button")].filter((node) => node.checkVisibility());
    const logo = document.querySelector(".brand img") as HTMLImageElement;
    const markRect = logo.getBoundingClientRect();
    const titleRect = document.querySelector("#loginTitle")!.getBoundingClientRect();
    return {
      body: getComputedStyle(document.body).backgroundColor,
      card: getComputedStyle(card).backgroundColor,
      titleFont: getComputedStyle(document.querySelector("#loginTitle")!).fontFamily,
      primary: getComputedStyle(document.querySelector(".submit-button")!).backgroundColor,
      logoDecoded: logo.complete && logo.naturalWidth > 0,
      logoSource: new URL(logo.src).pathname,
      brandGap: titleRect.left - markRect.right,
      cardWithinViewport: cardRect.left >= 0 && cardRect.right <= innerWidth,
      controlsContained: controls.length >= 3 && controls.every((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width >= 44 && rect.height >= 44 && rect.left >= cardRect.left && rect.right <= cardRect.right && rect.top >= cardRect.top && rect.bottom <= cardRect.bottom;
      }),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  expect(loginStyles.body).toBe("rgb(217, 221, 216)");
  expect(loginStyles.card).toBe("rgba(236, 238, 234, 0.96)");
  expect(loginStyles.titleFont).toContain("Haval");
  expect(loginStyles.primary).toBe("rgb(123, 13, 24)");
  expect(loginStyles.logoDecoded).toBeTruthy();
  expect(loginStyles.logoSource).toBe("/static/assets/d2dom-logo-tile.svg");
  expect(loginStyles.brandGap).toBeGreaterThanOrEqual(8);
  expect(loginStyles.cardWithinViewport).toBeTruthy();
  expect(loginStyles.controlsContained).toBeTruthy();
  expect(loginStyles.overflow).toBeLessThanOrEqual(1);
});
