import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("Data Integrity Agent returns read-only structured report", async ({ page }) => {
  await openApp(page, "/settings");

  const first = await page.evaluate(async () => {
    const response = await fetch("/api/data-integrity", { cache: "no-store" });
    return { status: response.status, body: await response.json() };
  });
  const second = await page.evaluate(async () => {
    const response = await fetch("/api/data-integrity", { cache: "no-store" });
    return { status: response.status, body: await response.json() };
  });

  expect(first.status).toBe(200);
  expect(first.body.agent).toBe("Data Integrity Agent");
  expect(Array.isArray(first.body.violations)).toBeTruthy();
  expect(first.body.summary).toBeTruthy();
  expect(first.body.material_counts?.stage).toBeTruthy();
  expect(first.body.material_counts?.health).toBeTruthy();
  expect(second.status).toBe(200);
  expect(second.body.summary.total).toBe(first.body.summary.total);
});
