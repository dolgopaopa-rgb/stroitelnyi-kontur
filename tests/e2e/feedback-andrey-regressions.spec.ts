import { expect, test } from "@playwright/test";
import { openApp, switchRole } from "../helpers/auth";

test("foreman can open the knowledge base", async ({ page }) => {
  await openApp(page, "/today");
  const available = await switchRole(page, "foreman:7");
  if (!available) return;
  await expect(page.locator('[data-testid="nav-documents"]')).not.toHaveAttribute("hidden", "");
});

test("material request offers warehouse pickup", async ({ page }) => {
  await openApp(page, "/materials");
  const method = page.locator('#materialForm select[name="delivery_method"]');
  await expect(method).toHaveCount(1);
  await expect(method.locator('option[value="delivery"]')).toHaveText("Доставка на объект");
  await expect(method.locator('option[value="warehouse_pickup"]')).toHaveText("Вывоз со склада");
  await method.selectOption("warehouse_pickup", { force: true });
  await expect(method).toHaveValue("warehouse_pickup");
});
