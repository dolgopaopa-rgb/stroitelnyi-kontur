import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("objects screen has list and object detail area", async ({ page }) => {
  await openApp(page, "/objects");
  const rows = page.locator("#projectRows");
  await expect(rows).toBeVisible();
  const card = rows.locator('[data-testid="object-card"][data-open-project]').first();
  await expect(card, "The object detail check requires a seeded active project").toBeVisible();
  const title = await card.locator("strong").first().innerText();
  await card.click();
  const detail = page.locator("#projectDetail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(title);
  await expect(detail.locator("[data-collapse-project-detail]")).toBeVisible();
  await detail.locator("[data-collapse-project-detail]").click();
  await expect(detail).toBeHidden();
  await expect(rows).toBeVisible();
});
