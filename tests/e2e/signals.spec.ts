import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("signals page opens and does not show duplicated raw enum values", async ({ page }) => {
  await openApp(page, "/signals");
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("in_progress");
  expect(text).not.toContain("construction_manager");
  const signalRows = await page.locator(".signal-row").evaluateAll((nodes) =>
    nodes.map((node) =>
      (node.textContent || "")
        .replace(/\s+/g, " ")
        .replace(/ещё \d+ позиций/g, "")
        .trim()
    )
  );
  for (let index = 2; index < signalRows.length; index += 1) {
    expect(signalRows[index]).not.toBe(signalRows[index - 1]);
    expect(signalRows[index]).not.toBe(signalRows[index - 2]);
  }
});

test("signal grouping collapses repeated equal messages", async ({ page }) => {
  await openApp(page, "/signals");
  let result: { signalCount: number; itemCount: number; preview: { visible: string[]; hidden: number } } | null = null;
  for (let attempt = 0; attempt < 10 && !result; attempt += 1) {
    result = await page
      .evaluate(() => {
        const rows = Array.from({ length: 4 }, (_, index) => ({
          id: index + 1,
          project_id: 13,
          project_title: "Объект #13",
          title: "Материалы по заявке получены",
          text: "Квартира на Севастопольском: материалы по заявке от 15.06.2026 получены прорабом",
          related_type: "material_request",
          related_id: index + 1,
          created_at: "2026-06-16 10:00:00",
          is_read: 0,
        }));
        const signals = (window as any).__konturDedupeSignals(rows);
        const preview = (window as any).__konturSignalPreviewEntries(signals[0].rows);
        return { signalCount: signals.length, itemCount: signals[0].rows.length, preview };
      })
      .catch(() => null);
    if (!result) await page.waitForTimeout(150);
  }
  expect(result).not.toBeNull();
  if (!result) throw new Error("Signal grouping helpers were not available.");
  expect(result.signalCount).toBe(1);
  expect(result.itemCount).toBe(4);
  expect(result.preview.visible).toEqual(["Квартира на Севастопольском: материалы по заявке от 15.06.2026 получены прорабом"]);
  expect(result.preview.hidden).toBe(3);
});
