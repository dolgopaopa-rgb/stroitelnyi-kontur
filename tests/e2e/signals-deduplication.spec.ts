import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("signals are grouped and do not repeat identical consecutive text", async ({ page }) => {
  await openApp(page, "/signals");
  await expect(page.locator('[data-testid="signals-list"]')).toBeVisible();
  const hasDuplicate = await page.evaluate(() => {
    return [...document.querySelectorAll('[data-testid="signal-card"] .signal-preview')].some((card) => {
      const rows = [...card.querySelectorAll("span")].map((node) => node.textContent?.trim()).filter(Boolean);
      return rows.some((text, index) => index > 0 && text === rows[index - 1]);
    });
  });
  expect(hasDuplicate).toBe(false);
});
