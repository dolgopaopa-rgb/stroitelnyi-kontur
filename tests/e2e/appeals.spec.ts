import { test, expect } from "@playwright/test";

test.describe("Appeals workspace", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(process.env.APPEALS_E2E !== "1", "Runs only in the isolated appeals test environment");
    const response = await request.get("/api/appeals/config");
    expect(response.ok()).toBeTruthy();
    const config = await response.json();
    test.skip(!config.enabled || !config.allowed, "Appeals feature or current pilot account is unavailable");
  });

  test("shows the work list and human-readable statuses", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto("/appeals");
    await expect(page.getByTestId("appeals-page")).toBeVisible();
    await expect(page.getByTestId("appeal-list")).toBeVisible();
    await expect(page.getByTestId("appeal-card").first()).toBeVisible();
    await expect(page.getByTestId("appeal-card-status").first()).toBeVisible();
    await expect(page.getByTestId("appeal-list")).not.toContainText("in_progress");
    await expect(page.getByTestId("appeal-list")).not.toContainText("construction_house");
    expect(consoleErrors).toEqual([]);
  });

  test("opens and closes a card on desktop and mobile", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto("/appeals");
    const card = page.getByTestId("appeal-card").first();
    const cardNumber = await card.getByTestId("appeal-card-number").textContent();
    await card.scrollIntoViewIfNeeded();
    await expect(card).toHaveAttribute("data-appeal-click-bound", "1");
    await card.click();
    await expect(page.getByTestId("appeal-detail-status")).toBeVisible();
    await expect(page.getByTestId("appeal-detail-next-step")).toBeVisible();
    await expect(page.getByTestId("appeal-detail")).toContainText(cardNumber || "Appeal");
    await page.getByTestId("appeal-detail-close").click();
    await expect(page.getByTestId("appeal-detail-status")).toHaveCount(0);
    await page.locator("#newAppealButton").click();
    await expect(page.locator("#appealDialog")).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});

test("hides appeals navigation outside the pilot allowlist", async ({ browser }) => {
  const login = process.env.APPEALS_DENIED_E2E_LOGIN;
  const password = process.env.APPEALS_DENIED_E2E_PASSWORD;
  test.skip(!login || !password, "Runs only with an isolated denied pilot account");

  const context = await browser.newContext();
  const loginResponse = await context.request.post("/api/login", {
    data: { login, password, next: "/appeals" },
  });
  expect(loginResponse.ok()).toBeTruthy();

  const configResponse = await context.request.get("/api/appeals/config");
  expect(configResponse.ok()).toBeTruthy();
  const config = await configResponse.json();
  expect(config.enabled).toBe(true);
  expect(config.allowed).toBe(false);

  const listResponse = await context.request.get("/api/appeals");
  expect(listResponse.status()).toBe(403);

  const page = await context.newPage();
  await page.goto("/appeals");
  await expect(page.getByTestId("nav-appeals")).toBeHidden();
  await expect(page.getByTestId("appeals-page")).toBeHidden();
  await expect(page.getByTestId("appeal-card")).toHaveCount(0);
  await context.close();
});
