import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block", storageState: { cookies: [], origins: [] } });

// The no-auth local server redirects /login; inspect the same served template directly.
const loginPage = "/static/login.html";

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 480, height: 720 },
  { width: 481, height: 720 },
  { width: 852, height: 768 },
];

test("password action labels stay inside their buttons", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(loginPage, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/static\/login\.html$/);
    await expect(page.locator("#loginForm")).toBeVisible();

    const tools = page.locator(".password-tool");
    await expect(tools).toHaveCount(3);

    const measurements = await tools.evaluateAll((buttons) =>
      buttons.map((button) => {
        const element = button as HTMLElement;
        const rect = element.getBoundingClientRect();
        const parentRect = element.parentElement?.getBoundingClientRect();
        return {
          text: element.textContent?.trim() || "",
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
          parentLeft: parentRect?.left ?? rect.left,
          parentRight: parentRect?.right ?? rect.right,
        };
      }),
    );

    for (const item of measurements) {
      expect(item.width, `${viewport.width}px: ${item.text} width`).toBeGreaterThan(0);
      expect(item.height, `${viewport.width}px: ${item.text} height`).toBeGreaterThan(0);
      expect(item.scrollWidth, `${viewport.width}px: ${item.text}`).toBeLessThanOrEqual(item.clientWidth + 1);
      expect(item.left, `${viewport.width}px: ${item.text}`).toBeGreaterThanOrEqual(item.parentLeft - 1);
      expect(item.right, `${viewport.width}px: ${item.text}`).toBeLessThanOrEqual(item.parentRight + 1);
      expect(item.left, `${viewport.width}px: ${item.text} viewport left`).toBeGreaterThanOrEqual(-1);
      expect(item.right, `${viewport.width}px: ${item.text} viewport right`).toBeLessThanOrEqual(viewport.width + 1);
    }

    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(horizontalOverflow, `${viewport.width}px: page overflow`).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 852, height: 768 });
  await page.goto(loginPage, { waitUntil: "domcontentloaded" });
  await page.locator("#passwordToggle").click();
  await expect(page.locator("#passwordToggle")).toHaveText("Скрыть пароль");
  await expect(page.locator("#passwordToggle")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#passwordInput")).toHaveAttribute("type", "text");
  const toggleFits = await page.locator("#passwordToggle").evaluate((button) => button.scrollWidth <= button.clientWidth + 1);
  expect(toggleFits).toBeTruthy();
  await page.locator("#passwordToggle").click();
  await expect(page.locator("#passwordToggle")).toHaveText("Показать пароль");
  await expect(page.locator("#passwordInput")).toHaveAttribute("type", "password");
});
