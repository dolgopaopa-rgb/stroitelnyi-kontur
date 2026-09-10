import { expect, test } from "@playwright/test";
import { openApp, switchRole } from "../helpers/auth";

test("admin can open read-only data integrity diagnostics", async ({ page }) => {
  await page.route("**/api/data-integrity", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        summary: { critical: 0, warnings: 1, info: 0, total: 1 },
        violations: [
          {
            violation_type: "waiting_check_without_submitted_at",
            entity_type: "task",
            entity_id: 14,
            object: "Тестовый объект",
            severity: "warning",
            reason: "submitted_at пустой",
            recommendation: "Восстановить submitted_at по task_events.",
            auto_fix_safe: false,
          },
        ],
      }),
    });
  });
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 1366, height: 900 });
  await openApp(page, "/settings");
  expect(await switchRole(page, "owner")).toBe(true);
  await expect(page.locator("#currentRoleSelect")).toHaveValue("owner");
  if (viewport) await page.setViewportSize(viewport);

  const panel = page.locator('[data-testid="data-integrity-panel"]');
  await expect(panel).toBeVisible();
  await expect(page.locator("#dataIntegrityStats")).toBeVisible();
  await expect(page.locator("[data-integrity-filter]")).toHaveCount(7);
  await page.locator("#refreshIntegrityButton").click();
  await expect(page.locator("#dataIntegrityRows")).toBeHidden();
  await panel.locator(".integrity-rows-details > summary").click();
  await expect(page.locator("#dataIntegrityRows")).toBeVisible();
  await expect(page.locator("#dataIntegrityRows")).toContainText("Не указана дата отправки на проверку");
  await expect(page.locator("#dataIntegrityRows")).toContainText("Задача №14");
  await expect(page.locator("#dataIntegrityRows")).toContainText("дата отправки на проверку пустой");
  await expect(page.locator(".integrity-technical-details code")).not.toBeVisible();
  await page.locator(".integrity-technical-details summary").click();
  await expect(page.locator(".integrity-technical-details code")).toBeVisible();
  await panel.locator(".integrity-rows-details > summary").click();
  await expect(page.locator("#dataIntegrityRows")).toBeHidden();
});
