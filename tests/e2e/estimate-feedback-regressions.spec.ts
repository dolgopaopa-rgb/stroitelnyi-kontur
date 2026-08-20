import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("estimate create form ignores repeated submit and explains missing files", async ({ page }) => {
  await openApp(page, "/estimates");
  await page.locator("#newEstimateJobButton").click();

  const suffix = Date.now();
  const customerName = `Заказчик двойного нажатия ${suffix}`;
  const form = page.locator("#estimateJobForm");
  await form.locator('input[name="title"]').fill("Проверка сметы");
  await form.locator('input[name="customer_name"]').fill(customerName);
  await form.locator('input[name="due_date"]').fill("2026-12-31");
  await expect(form.locator('select[name="manager_id"] option')).not.toHaveCount(0);
  await expect(form.locator('select[name="estimator_id"] option')).not.toHaveCount(0);

  let createRequests = 0;
  await page.route("**/api/estimate-jobs", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    createRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 650));
    await route.continue();
  });

  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/estimate-jobs") && response.request().method() === "POST");
  await form.evaluate((node) => {
    const first = new Event("submit", { bubbles: true, cancelable: true });
    const second = new Event("submit", { bubbles: true, cancelable: true });
    node.dispatchEvent(first);
    node.dispatchEvent(second);
  });

  await expect(form.locator('button[type="submit"]')).toBeDisabled();
  await expect(page.locator("#estimateJobFormStatus")).toContainText("Повторно нажимать не нужно");
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const created = await response.json();
  await expect(page.locator("#estimateJobDialog")).not.toBeVisible();
  expect(createRequests).toBe(1);

  try {
    const row = page.locator(".estimate-job-row").filter({ hasText: customerName }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("Без файлов");
    await row.locator("summary").click();
    await expect(row.getByTestId("estimate-input-state")).toContainText("файлы не приложены");
    await expect(row.getByTestId("estimate-input-state")).toContainText("Уточнить");
  } finally {
    if (created?.id) {
      await page.request.post(`/api/estimate-jobs/${created.id}/delete`, { data: {} });
    }
  }
});
