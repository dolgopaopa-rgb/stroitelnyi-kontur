import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("project card shows the customer phone and opens clear contact actions", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openApp(page, "/objects");

  const project = await page.evaluate(async () => {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        save_mode: "draft",
        title: "Тест контакта заказчика",
        customer_name: "Заказчик для проверки",
        customer_phone: "89091234567",
        customer_email: "customer@example.invalid",
      }),
    });
    if (!response.ok) throw new Error(`Project fixture failed: ${response.status}`);
    return response.json();
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await openApp(page, "/objects");
    await page.locator("#projectRows").locator(`[data-open-project="${project.id}"]`).click();

    const phoneAction = page.getByTestId("project-phone-action");
    await expect(phoneAction).toBeVisible();
    await expect(phoneAction).toContainText("+7-909-123-45-67");
    await phoneAction.click();

    const dialog = page.getByTestId("phone-call-dialog");
    await expect(dialog).toBeVisible();
    const dialogBox = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(dialogBox?.height || 0).toBeGreaterThan(0);
    expect(dialogBox?.height || 0).toBeLessThan((viewport?.height || 900) * 0.8);
    await expect(page.getByTestId("phone-call-number")).toHaveText("+7-909-123-45-67");
    await expect(page.getByTestId("phone-call-link")).toHaveAttribute("href", "tel:+79091234567");

    await page.getByTestId("phone-copy-button").click();
    await expect(page.locator("#toast")).toContainText("Номер телефона скопирован");
  } finally {
    await page
      .evaluate(async (projectId) => {
        await fetch(`/api/projects/${projectId}/archive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Удаление синтетического проекта после QA" }),
        });
        await fetch(`/api/projects/${projectId}/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      }, project.id)
      .catch(() => undefined);
  }
});
