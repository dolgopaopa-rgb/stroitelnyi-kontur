import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("task cards separate type, title, meta, status and priority", async ({ page }) => {
  await openApp(page, "/tasks");
  const cards = page.locator('[data-testid="task-card"]:visible');
  await expect(cards.first(), "Expected at least one visible task card on the tasks page").toBeVisible();
  const first = cards.first();
  await expect(first.locator('[data-testid="task-type-badge"]')).toBeVisible();
  await expect(first.locator('[data-testid="task-title"]')).toBeVisible();
  await expect(first.locator('[data-testid="task-meta"]')).toBeVisible();
  await expect(first.locator('[data-testid="task-status-badge"]')).toBeVisible();
  await expect(first.locator('[data-testid="task-priority-badge"]')).toBeVisible();
});
