import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("estimates page responds to a real mobile touch scroll gesture", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "Touch gesture is checked in the mobile browser project");

  await openApp(page, "/estimates");
  await page.locator("#newEstimateJobButton").click();
  const people = await page.locator("#estimateJobForm").evaluate((formNode) => {
    const form = formNode as HTMLFormElement;
    const manager = form.elements.namedItem("manager_id") as HTMLSelectElement;
    const estimator = form.elements.namedItem("estimator_id") as HTMLSelectElement;
    return { managerId: manager.value, estimatorId: estimator.value };
  });
  await page.locator("#estimateJobDialog").getByRole("button", { name: "Отмена" }).click();
  expect(people.managerId).not.toBe("");
  expect(people.estimatorId).not.toBe("");

  const createdIds: number[] = [];
  try {
    for (let index = 0; index < 9; index += 1) {
      const response = await page.request.post("/api/estimate-jobs", {
        data: {
          title: `Мобильная проверка прокрутки ${index + 1}`,
          customer_name: `Синтетический заказчик ${index + 1}`,
          manager_id: people.managerId,
          estimator_id: people.estimatorId,
          received_at: "2026-08-20",
          due_date: "2026-12-31",
          site_costs_policy: "include",
          attachments: [],
        },
      });
      expect(response.ok()).toBeTruthy();
      const created = await response.json();
      createdIds.push(Number(created.id));
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await openApp(page, "/estimates");
    await expect(page.locator(".estimate-job-collapsible").filter({ hasText: "Мобильная проверка прокрутки" })).toHaveCount(9);
    await page.locator(".estimate-job-collapsible").evaluateAll((rows) => rows.forEach((row) => row.setAttribute("open", "")));
    await page.evaluate(() => window.scrollTo(0, 0));

    const before = await page.evaluate(() => ({
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }));
    expect(before.scrollHeight, "The estimates page must be longer than the mobile viewport").toBeGreaterThan(before.viewportHeight + 80);

    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 190, y: 700, radiusX: 4, radiusY: 4, force: 1, id: 0 }],
    });
    for (let y = 685; y >= 130; y -= 15) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 190, y, radiusX: 4, radiusY: 4, force: 1, id: 0 }],
      });
      await page.waitForTimeout(18);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(80);
    const after = await page.evaluate(() => window.scrollY);
    expect(after, `Touch scroll must move the page from ${before.scrollY}`).toBeGreaterThan(before.scrollY);
  } finally {
    for (const id of createdIds) {
      await page.request.post(`/api/estimate-jobs/${id}/delete`, { data: {} }).catch(() => undefined);
    }
  }
});
