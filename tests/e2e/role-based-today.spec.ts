import { expect, test } from "@playwright/test";
import { openApp, switchRole } from "../helpers/auth";

const rolePanels: Array<[string, string]> = [
  ["owner", "today-role-owner"],
  ["construction_manager", "today-role-project-manager"],
  ["foreman:7", "today-role-foreman"],
  ["master", "today-role-worker"],
  ["procurement_manager", "today-role-procurement"],
  ["estimator", "today-role-estimator"],
];

test("today screen changes by role", async ({ page }) => {
  await openApp(page, "/today");
  for (const [role, testId] of rolePanels) {
    const available = await switchRole(page, role);
    if (!available) continue;
    await expect(page.locator(`[data-testid="${testId}"]`)).toBeVisible();
  }
});
