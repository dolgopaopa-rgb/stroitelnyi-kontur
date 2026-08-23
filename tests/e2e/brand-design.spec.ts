import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("Open Village brand system is applied to the working shell", async ({ page, request }) => {
  for (const asset of [
    "/static/brand-2026.css",
    "/static/assets/brand-2026/d2dom-favicon-32.png",
    "/static/assets/brand-2026/d2dom-favicon-192.png",
    "/static/assets/brand-2026/d2dom-favicon-512.png",
    "/static/assets/brand-2026/d2dom-apple-touch-180.png",
    "/static/assets/brand-2026/Haval-Light.woff2",
    "/static/assets/brand-2026/Involve-Regular.woff2",
    "/static/assets/brand-2026/Involve-SemiBold.woff2",
  ]) {
    const response = await request.get(asset);
    expect(response.ok(), `${asset} must be available`).toBeTruthy();
  }

  await openApp(page, "/today");
  await expect(page.locator("body")).toHaveClass(/brand-system-2026/);
  await expect(page.locator(".brand-company")).toHaveText("Д²Дом");
  await expect(page.locator(".brand strong")).toHaveText("Контур");

  const shell = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const sidebar = getComputedStyle(document.querySelector(".sidebar") as HTMLElement);
    const sidebarNode = document.querySelector(".sidebar") as HTMLElement;
    const activeNav = getComputedStyle(document.querySelector(".nav-button.active") as HTMLElement);
    const panel = getComputedStyle(document.querySelector(".panel") as HTMLElement);
    const primary = document.querySelector(".primary") as HTMLElement;
    const primaryStyle = primary ? getComputedStyle(primary) : null;
    return {
      bodyFont: body.fontFamily,
      bodyBackground: body.backgroundColor,
      sidebarBackground: sidebar.backgroundColor,
      sidebarOverflowMode: sidebar.overflowX,
      activeNavBackground: activeNav.backgroundColor,
      panelBackground: panel.backgroundColor,
      panelRadius: Number.parseFloat(panel.borderRadius),
      primaryBackground: primaryStyle?.backgroundColor || "",
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 4,
    };
  });

  expect(shell.bodyFont).toContain("Involve");
  expect(shell.bodyBackground).toBe("rgb(243, 245, 244)");
  expect(shell.sidebarBackground).toBe("rgb(32, 39, 43)");
  expect(shell.sidebarOverflowMode).toBe("hidden");
  expect(shell.activeNavBackground).toBe("rgb(123, 13, 24)");
  expect(shell.panelBackground).toBe("rgb(236, 238, 234)");
  expect(shell.panelRadius).toBeLessThanOrEqual(8);
  expect(shell.primaryBackground).toBe("rgb(123, 13, 24)");
  expect(shell.horizontalOverflow).toBeFalsy();
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
    const visibleCards = [...document.querySelectorAll(".today-workspace-grid .panel")].filter(
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

test("desktop shell stays compact and keeps long navigation inside the sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openApp(page, "/today");

  for (const width of [981, 1024, 1180, 1181, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 720 });
    const result = await page.evaluate(() => {
      const topbar = document.querySelector(".topbar") as HTMLElement;
      const actions = [...topbar.querySelectorAll<HTMLElement>(".actions > *")].filter(
        (node) => getComputedStyle(node).display !== "none",
      );
      const feedback = document.querySelector('[data-testid="nav-feedback"]') as HTMLElement;
      const sidebar = document.querySelector(".sidebar") as HTMLElement;
      const densitySelect = document.querySelector("#densitySelect") as HTMLSelectElement;
      const objectCards = [...document.querySelectorAll<HTMLElement>(".today-object-card")].filter(
        (node) => getComputedStyle(node).display !== "none" && node.getClientRects().length > 0,
      );
      const objectButtons = objectCards.flatMap((card) => [...card.querySelectorAll<HTMLElement>(".today-object-actions button")]);
      const actionRows = actions.map((node) => Math.round(node.getBoundingClientRect().top));
      const feedbackRect = feedback.getBoundingClientRect();
      const sidebarRect = sidebar.getBoundingClientRect();
      return {
        topbarHeight: topbar.getBoundingClientRect().height,
        actionRowCount: new Set(actionRows).size,
        feedbackInside: feedbackRect.left >= sidebarRect.left && feedbackRect.right <= sidebarRect.right + 1,
        feedbackTextFits: feedback.scrollWidth <= feedback.clientWidth + 1,
        densitySelectWidth: densitySelect.getBoundingClientRect().width,
        objectCardCount: objectCards.length,
        objectButtonMaxHeight: objectButtons.length ? Math.max(...objectButtons.map((button) => button.getBoundingClientRect().height)) : 0,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });

    expect(result.topbarHeight, `topbar at ${width}px`).toBeLessThanOrEqual(56);
    expect(result.actionRowCount, `toolbar rows at ${width}px`).toBe(1);
    expect(result.feedbackInside, `feedback navigation at ${width}px`).toBeTruthy();
    expect(result.feedbackTextFits, `feedback text at ${width}px`).toBeTruthy();
    expect(result.densitySelectWidth, `density select at ${width}px`).toBeGreaterThanOrEqual(80);
    expect(result.objectCardCount).toBeGreaterThan(0);
    expect(result.objectButtonMaxHeight).toBeLessThanOrEqual(30);
    expect(result.horizontalOverflow, `page overflow at ${width}px`).toBeFalsy();
  }
});

test("login page uses the official D2Dom mark and keeps password actions readable", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/static/login.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toHaveClass(/brand-system-2026/);
    await expect(page.locator("#loginTitle")).toHaveText("Контур Д²Дом");
    await expect(page.locator(".brand img")).toHaveAttribute("src", /d2dom-favicon-192\.png$/);

    const loginLayout = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll<HTMLElement>(".password-tool")];
      const buttonFits = buttons.map((button) => ({
        text: button.textContent?.trim() || "",
        horizontal: button.scrollWidth <= button.clientWidth + 1,
        vertical: button.scrollHeight <= button.clientHeight + 1,
        width: button.getBoundingClientRect().width,
        height: button.getBoundingClientRect().height,
      }));
      return {
        body: getComputedStyle(document.body).backgroundColor,
        card: getComputedStyle(document.querySelector(".login-card") as HTMLElement).backgroundColor,
        titleFont: getComputedStyle(document.querySelector("#loginTitle") as HTMLElement).fontFamily,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        buttonFits,
      };
    });

    expect(loginLayout.body).toBe("rgb(45, 50, 53)");
    expect(loginLayout.card).toBe("rgb(236, 238, 234)");
    expect(loginLayout.titleFont).toContain("Haval");
    expect(loginLayout.horizontalOverflow, `${viewport.width}px must not overflow`).toBeFalsy();
    expect(loginLayout.buttonFits).toHaveLength(3);
    for (const button of loginLayout.buttonFits) {
      expect(button.horizontal, `${button.text} must fit horizontally at ${viewport.width}px`).toBeTruthy();
      expect(button.vertical, `${button.text} must fit vertically at ${viewport.width}px`).toBeTruthy();
      expect(button.height).toBeGreaterThanOrEqual(42);
    }
  }
});
