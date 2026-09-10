import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test.use({ serviceWorkers: "block" });

test("photo report shows a clear fallback when a preview file is unavailable", async ({ page }) => {
  let fileUnavailable = true;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
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
            { id: 999, file_name: "preview-unavailable.png", mime_type: "image/png" },
          ],
        },
      ]),
    });
  });
  await page.route("**/api/documents/999/download", async (route) => {
    await route.fulfill({
      status: fileUnavailable ? 502 : 200,
      contentType: fileUnavailable ? "text/plain" : "image/png",
      headers: { "Cache-Control": "no-store" },
      body: fileUnavailable ? "unavailable" : png,
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/photo-reports");

  const unavailable = page.locator(".media-thumb.is-unavailable");
  await expect(unavailable).toBeVisible();
  await expect(unavailable).toContainText("Файл недоступен");
  await expect(unavailable.locator("img")).toBeHidden();
  await unavailable.click();
  // Audit trace call@38: two GET 502 responses, then an open preview with an
  // error and retry. The 23dafdd toast-only fallback was intentionally replaced.
  const preview = page.getByTestId("media-preview-dialog");
  const body = page.getByTestId("media-preview-body");
  await expect(preview).toBeVisible();
  await expect(page.locator("#mediaPreviewTitle")).toHaveText("preview-unavailable.png");
  await expect(body.getByRole("status")).toContainText("Не удалось открыть файл");
  await expect(body.locator("img")).toBeHidden();
  await expect(body.getByRole("button", { name: "Повторить", exact: true })).toBeEnabled();
  await expect(page.locator("#mediaPreviewOpenOriginal")).toHaveAttribute("href", "/api/documents/999/download");

  await page.locator("#mediaPreviewClose").click();
  await expect(preview).toBeHidden();
  await expect(page.locator("#photosView")).toHaveClass(/active/);
  await unavailable.click();
  await expect(body.getByRole("status")).toContainText("Не удалось открыть файл");

  fileUnavailable = false;
  await body.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(body.locator("img")).toBeVisible();
  await expect(body.locator("img")).toHaveJSProperty("naturalWidth", 1);
  await expect(body.getByRole("status")).toHaveCount(0);
  await page.locator("#mediaPreviewCloseBottom").click();
  await expect(preview).toBeHidden();
  await expect(body.locator("img")).toHaveCount(0);
  await expect(page).toHaveURL(/\/photo-reports/);
  await expect(page.locator("#photosView")).toHaveClass(/active/);
});

test("mobile More menu keeps refresh and logout available", async ({ page }) => {
  await page.setViewportSize({ width: 852, height: 900 });
  await openApp(page, "/today");
  await page.locator("#mobileMoreButton").click();
  await expect(page.locator('[data-mobile-system-action="new-project"]')).toBeVisible();
  await expect(page.locator('[data-mobile-system-action="refresh"]')).toBeVisible();
  await expect(page.locator('[data-mobile-system-action="logout"]')).toBeVisible();
});
