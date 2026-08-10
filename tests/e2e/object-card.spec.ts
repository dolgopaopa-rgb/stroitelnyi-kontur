import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("objects screen has list and object detail area", async ({ page }) => {
  await openApp(page, "/objects");
  await expect(page.locator("#projectRows")).toBeVisible();
  const cards = page.locator('#projectsView [data-testid="object-card"]');
  if (await cards.count()) {
    await expect(cards.first()).toBeVisible();
  } else {
    await expect(page.locator("#projectRows")).toContainText(/объект|пока|нет/i);
  }
});
