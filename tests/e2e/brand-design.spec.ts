import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("Open Village brand system is applied to the working shell", async ({ page, request }) => {
  for (const asset of [
    "/static/brand-2026.css",
    "/static/assets/brand-2026/d2dom-mark.svg",
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
  expect(shell.bodyBackground).toBe("rgb(217, 221, 216)");
  expect(shell.sidebarBackground).toBe("rgb(45, 50, 53)");
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
  await expect(page.locator("#loginTitle")).toHaveText("Контур Д²Дом");
  await expect(page.locator(".brand img")).toBeVisible();

  const loginStyles = await page.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    card: getComputedStyle(document.querySelector(".login-card") as HTMLElement).backgroundColor,
    titleFont: getComputedStyle(document.querySelector("#loginTitle") as HTMLElement).fontFamily,
  }));
  expect(loginStyles.body).toBe("rgb(45, 50, 53)");
  expect(loginStyles.card).toBe("rgb(236, 238, 234)");
  expect(loginStyles.titleFont).toContain("Haval");
});
