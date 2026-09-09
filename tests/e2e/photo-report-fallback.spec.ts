import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test.use({ serviceWorkers: "block" });

test("photo report shows a clear fallback when a preview file is unavailable", async ({ page }) => {
  await page.route("**/api/photo-reports", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 501,
          project_title: "Тестовый объект",
          status: "submitted",
          report_date: "2026-08-31",
          author_name: "Тестовый автор",
          stage: "Отделка",
          zones: "Первый этаж",
          attachments: [
            { id: 999, file_name: "preview-unavailable.jpg", mime_type: "image/jpeg" },
          ],
        },
      ]),
    });
  });
  await page.route("**/api/documents/999/download", async (route) => {
    await route.fulfill({ status: 502, contentType: "text/plain", body: "unavailable" });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/photo-reports");

  const unavailable = page.locator(".media-thumb.is-unavailable");
  await expect(unavailable).toBeVisible();
  await expect(unavailable).toContainText("Файл недоступен");
  await expect(unavailable.locator("img")).toBeHidden();
  await unavailable.click();
  await expect(page.locator("#toast")).toContainText("Файл временно недоступен");
});

test("mobile More menu keeps refresh and logout available", async ({ page }) => {
  await page.setViewportSize({ width: 852, height: 900 });
  await openApp(page, "/today");
  await page.locator("#mobileMoreButton").click();
  await expect(page.locator('[data-mobile-system-action="new-project"]')).toBeVisible();
  await expect(page.locator('[data-mobile-system-action="refresh"]')).toBeVisible();
  await expect(page.locator('[data-mobile-system-action="logout"]')).toBeVisible();
});
