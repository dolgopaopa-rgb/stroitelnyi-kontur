import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("knowledge base opens as a file manager", async ({ page }) => {
  await openApp(page, "/documents");
  await expect(page.locator("#documentCards")).toBeVisible();
});
