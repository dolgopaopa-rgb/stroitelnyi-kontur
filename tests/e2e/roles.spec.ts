import { expect, test } from "@playwright/test";
import { openApp, switchRole } from "../helpers/auth";
import { expectedVisibleByRole } from "../helpers/roles";

test("role-based menus expose expected sections", async ({ page }) => {
  await openApp(page, "/today");
  const viewport = page.viewportSize();
  if ((viewport?.width || 0) <= 820) {
    await expect(page.locator('[data-testid="mobile-bottom-nav"]')).toBeVisible();
    return;
  }
  for (const [role, ids] of Object.entries(expectedVisibleByRole)) {
    const available = await switchRole(page, role);
    if (!available) continue;
    for (const id of ids) {
      await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
    }
  }
});
