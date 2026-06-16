import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("task cards have separated type/status/priority badges when tasks exist", async ({ page }) => {
  await openApp(page, "/tasks");
  const cards = page.locator('[data-testid="task-card"]');
  if ((await cards.count()) === 0) return;
  const examplesToCheck = Math.min(await cards.count(), 5);
  for (let index = 0; index < examplesToCheck; index += 1) {
    const card = cards.nth(index);
    const typeBadge = card.locator('[data-testid="task-type-badge"]').first();
    const statusBadge = card.locator('[data-testid="task-status-badge"]').first();
    const priorityBadge = card.locator('[data-testid="task-priority-badge"]').first();
    const title = card.locator(".task-summary-title strong").first();
    await expect(typeBadge).toBeVisible();
    await expect(statusBadge).toBeVisible();
    await expect(priorityBadge).toBeVisible();
    await expect(title).toBeVisible();

    const titleText = (await title.innerText()).trim();
    const statusText = (await statusBadge.innerText()).trim();
    const priorityText = (await priorityBadge.innerText()).trim();
    expect(titleText).not.toContain(statusText);
    expect(titleText).not.toContain(priorityText);

    const sameContainer = await statusBadge.evaluate((node) => Boolean(node.closest(".task-summary-title")));
    expect(sameContainer).toBe(false);
  }
});
