import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

const routes = ["/today", "/objects", "/estimates", "/tasks", "/works", "/materials", "/variations", "/photo-reports", "/object-issues", "/locations", "/documents", "/signals", "/feedback", "/settings"];

test.describe("Navigation QA", () => {
  for (const route of routes) {
    test(`${route} opens without 404 or blank screen`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status()).not.toBe(404);
      await openApp(page, route);
      const text = await page.locator("body").innerText();
      expect(text.trim().length).toBeGreaterThan(20);
    });
  }
});
