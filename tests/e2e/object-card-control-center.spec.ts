import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("object card exposes summary, attention and quick actions", async ({ page }) => {
  await openApp(page, "/objects");
  const firstObject = page.locator("#projectRows button, #projectRows .clickable").first();
  if (!(await firstObject.count())) test.skip();
  await firstObject.click();
  await expect(page.locator("#projectDetail")).toBeVisible();
  await expect(page.locator('[data-testid="object-summary"]')).toBeVisible();
  await expect(page.locator('[data-testid="object-attention-block"]')).toBeVisible();
  await expect(page.locator('[data-testid="object-quick-actions"]')).toBeVisible();
});
