import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("task cards have separated type/status/priority badges when tasks exist", async ({ page }) => {
  await openApp(page, "/tasks");
  const cards = page.locator('[data-testid="task-card"]');
  if ((await cards.count()) === 0) return;
  await expect(page.locator('[data-testid="task-type-badge"]').first()).toBeVisible();
  await expect(page.locator('[data-testid="task-status-badge"]').first()).toBeVisible();
  await expect(page.locator('[data-testid="task-priority-badge"]').first()).toBeVisible();
});
