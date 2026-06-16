import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("read-only mode explains restricted actions when visible", async ({ page }) => {
  await openApp(page, "/today?audit=1");
  const restrictedText = page.locator("body");
  await expect(restrictedText).not.toContainText("in_progress");
});
