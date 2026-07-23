import { test, expect } from "@playwright/test";

test.describe("Рабочее место обращений", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(process.env.APPEALS_E2E !== "1", "Запускается только в изолированной тестовой среде обращений");
    const response = await request.get("/api/appeals/config");
    expect(response.ok()).toBeTruthy();
    const config = await response.json();
    test.skip(!config.enabled, "Функция обращений выключена feature flag");
  });

  test("показывает рабочий список и человекочитаемые статусы", async ({ page }) => {
    await page.goto("/appeals");
    await expect(page.getByTestId("appeals-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Рабочее место обращений" })).toBeVisible();
    await expect(page.getByTestId("appeal-list")).toBeVisible();
    await expect(page.getByTestId("appeal-card").first()).toBeVisible();
    await expect(page.getByTestId("appeal-card").filter({ hasText: "Новое" }).first()).toBeVisible();
    await expect(page.getByTestId("appeal-list")).not.toContainText("in_progress");
    await expect(page.getByTestId("appeal-list")).not.toContainText("construction_house");
  });

  test("открывает карточку и безопасную форму создания без отправки", async ({ page }) => {
    await page.goto("/appeals");
    const card = page.getByTestId("appeal-card").filter({ hasText: "Новое" }).first();
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await expect(page.getByTestId("appeal-detail")).toContainText("Следующий шаг");
    await page.getByRole("button", { name: "Новое обращение" }).click();
    await expect(page.locator("#appealDialog")).toBeVisible();
    await expect(page.locator("#appealDialog")).toContainText("подтверждённый канал связи");
  });
});
