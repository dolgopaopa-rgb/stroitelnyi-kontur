import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("signals page opens and does not show duplicated raw enum values", async ({ page }) => {
  await openApp(page, "/signals");
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("in_progress");
  expect(text).not.toContain("construction_manager");
});
