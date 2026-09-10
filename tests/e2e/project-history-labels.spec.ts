import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("a new project displays its handover history in Russian", async ({ page, baseURL }) => {
  expect(new URL(baseURL || "http://invalid").hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  await openApp(page, "/objects");
  const title = `QA history labels ${Date.now()}`;
  const response = await page.request.post("/api/projects", {
    data: { save_mode: "draft", title, customer_name: title },
  });
  expect(response.status(), await response.text()).toBe(201);
  const project = await response.json();
  await openApp(page, `/objects?project=${project.id}`);
  await page.locator('[data-project-tab="events"]').click();
  const detail = page.locator("#projectDetail");
  await expect(detail).toContainText("Передача объекта");
  await expect(detail).not.toContainText("handover");
});
