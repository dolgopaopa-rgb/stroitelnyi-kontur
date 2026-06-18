import { expect, test } from "@playwright/test";
import { openApp, switchRole } from "../helpers/auth";

test("tasks are grouped by role ownership and next responsibility", async ({ page }) => {
  await openApp(page, "/tasks");
  await switchRole(page, "owner");

  const ownerSections = page.locator('[data-testid="task-workflow-section"]');
  await expect(ownerSections.first()).toBeVisible();
  await expect(page.locator("#taskRows")).toContainText(/Я поставил|Мне нужно проверить|На моих объектах|Мне нужно сделать/);

  await switchRole(page, "master");
  await openApp(page, "/tasks");

  await expect(page.locator('[data-task-workflow="my_action"]').first()).toBeVisible();
  await expect(page.locator("#taskRows")).toContainText("Мне нужно сделать");
});
