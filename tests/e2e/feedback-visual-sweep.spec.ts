import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { openApp } from "../helpers/auth";

const widths = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920];

test("feedback fixes stay readable from narrow phone to wide desktop", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "One controlled viewport sweep is enough");

  await openApp(page, "/estimates");
  await page.locator("#newEstimateJobButton").click();
  const people = await page.locator("#estimateJobForm").evaluate((formNode) => {
    const form = formNode as HTMLFormElement;
    const manager = form.elements.namedItem("manager_id") as HTMLSelectElement;
    const estimator = form.elements.namedItem("estimator_id") as HTMLSelectElement;
    return { managerId: manager.value, estimatorId: estimator.value };
  });
  await page.locator("#estimateJobDialog").getByRole("button", { name: "Отмена" }).click();

  const createdIds: number[] = [];
  try {
    for (let index = 0; index < 4; index += 1) {
      const response = await page.request.post("/api/estimate-jobs", {
        data: {
          title: `Проверка длинного названия сметного задания и его переноса ${index + 1}`,
          customer_name: `Заказчик для визуальной проверки ${index + 1}`,
          manager_id: people.managerId,
          estimator_id: people.estimatorId,
          received_at: "2026-08-20",
          due_date: "2026-12-31",
          site_costs_policy: "include",
          comment: index % 2 ? "" : "Есть комментарий менеджера с важными вводными по расчёту.",
          attachments: [],
        },
      });
      expect(response.ok()).toBeTruthy();
      const created = await response.json();
      createdIds.push(Number(created.id));
    }

    const screenshotDir = path.resolve("qa-artifacts/latest/screenshots");
    fs.mkdirSync(screenshotDir, { recursive: true });
    for (const width of widths) {
      const height = width <= 430 ? 844 : width <= 768 ? 1024 : 900;
      await page.setViewportSize({ width, height });
      await page.reload({ waitUntil: "domcontentloaded" });
      await openApp(page, "/estimates");
      const rows = page.locator(".estimate-job-row").filter({ hasText: "Проверка длинного названия" });
      await expect(rows).toHaveCount(4);

      const layout = await page.evaluate(() => {
        const visible = (node: Element) => {
          const style = getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden" && node.getClientRects().length > 0;
        };
        const viewport = window.innerWidth;
        const offenders = [...document.querySelectorAll(".main, #estimatesView, .estimate-job-row, .estimate-job-summary, button")]
          .filter(visible)
          .filter((node) => {
            const box = node.getBoundingClientRect();
            return box.left < -2 || box.right > viewport + 2;
          })
          .map((node) => `${node.tagName.toLowerCase()}.${(node as HTMLElement).className}`)
          .slice(0, 8);
        return {
          viewport,
          pageScrollWidth: document.documentElement.scrollWidth,
          offenders,
          clippedStats: [...document.querySelectorAll("#estimatesView .task-stat")]
            .filter(visible)
            .filter((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)
            .map((node) => node.textContent?.trim() || "Показатель"),
        };
      });

      expect(layout.pageScrollWidth, `No page-wide horizontal overflow at ${width}px`).toBeLessThanOrEqual(layout.viewport + 2);
      expect(layout.offenders, `Visible controls must fit at ${width}px`).toEqual([]);
      expect(layout.clippedStats, `Estimate metric labels must not be clipped at ${width}px`).toEqual([]);
      await page.screenshot({ path: path.join(screenshotDir, `feedback-estimates-${width}.png`), fullPage: true });
    }
  } finally {
    for (const id of createdIds) {
      await page.request.post(`/api/estimate-jobs/${id}/delete`, { data: {} }).catch(() => undefined);
    }
  }
});
