import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("Data Integrity Agent returns structured report and safe cleanup endpoint", async ({ page }) => {
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
  expect(first.body.violation_counts).toBeTruthy();
  expect(first.body.warning_counts_by_type).toBeTruthy();
  expect(first.body.material_counts?.stage).toBeTruthy();
  expect(first.body.material_counts?.health).toBeTruthy();
  expect(second.status).toBe(200);
  expect(second.body.summary.total).toBe(first.body.summary.total);

  const fix = await page.evaluate(async () => {
    const response = await fetch("/api/data-integrity/fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return { status: response.status, body: await response.json() };
  });
  expect(fix.status).toBe(200);
  expect(fix.body.ok).toBeTruthy();
  expect(fix.body.backup).toContain("backups/");
  expect(fix.body.cleanup).toBeTruthy();
  expect(fix.body.after?.summary).toBeTruthy();
});
