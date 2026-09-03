import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("materials page has pipeline and quick filters", async ({ page }) => {
  await openApp(page, "/materials");
  await expect(page.locator('[data-testid="materials-pipeline"]')).toBeVisible();
  await expect(page.locator('[data-testid="material-status-tabs"]')).toBeVisible();
  await expect(page.locator("[data-material-quick-filter]").first()).toBeVisible();
});

test("the last selected material list wins when responses arrive out of order", async ({ page }) => {
  let activeRequestCount = 0;
  const row = (title: string, archivedAt: string | null) => ({
    id: archivedAt ? 902 : 901,
    batch_id: archivedAt ? 502 : 501,
    project_id: 1,
    project_title: "Тестовый объект",
    title,
    quantity: 1,
    unit: "шт.",
    total_amount: 100,
    batch_status: archivedAt ? "received" : "new",
    batch_stage: archivedAt ? "closed" : "request",
    batch_health: "normal",
    batch_archived_at: archivedAt,
    batch_created_at: "2026-09-03 10:00:00",
  });

  await page.route("**/api/material-requests*", async (route) => {
    const archive = new URL(route.request().url()).searchParams.get("archive") === "1";
    if (archive) await new Promise((resolve) => setTimeout(resolve, 350));
    if (!archive && activeRequestCount++ > 0) await new Promise((resolve) => setTimeout(resolve, 25));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([archive ? row("Архивная заявка", "2026-09-01 12:00:00") : row("Активная заявка", null)]),
    });
  });

  await openApp(page, "/materials");
  await expect(page.getByText("Активная заявка", { exact: true })).toBeVisible();

  await page.locator('[data-material-list-mode="archive"]').click();
  await page.locator('[data-material-list-mode="active"]').click();
  await page.waitForTimeout(500);

  await expect(page.locator('[data-material-list-mode="active"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Активная заявка", { exact: true })).toBeVisible();
  await expect(page.getByText("Архивная заявка", { exact: true })).toHaveCount(0);
});
