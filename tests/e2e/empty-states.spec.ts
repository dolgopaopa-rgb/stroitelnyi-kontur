import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("empty states explain next action", async ({ page }) => {
  await openApp(page, "/photo-reports");
  await expect(page.locator("body")).toContainText(/фотоотч|Фотоотч/i);
  await openApp(page, "/object-issues");
  await expect(page.locator("body")).toContainText(/замечан|Замечан/i);
});
