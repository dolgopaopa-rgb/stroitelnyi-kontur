import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("objects screen has list and object detail area", async ({ page }) => {
  await openApp(page, "/objects");
  await expect(page.locator("#projectRows")).toBeVisible();
  const projectButton = page.locator("#projectRows [data-open-project]").first();
  if (await projectButton.count()) {
    await expect(projectButton).toBeVisible();
    await projectButton.click();
    await expect(page.locator('#projectDetail[data-testid="object-card"]')).toBeVisible();
  } else {
    await expect(page.locator("#projectRows")).toContainText(/объект|пока|нет/i);
  }
});
