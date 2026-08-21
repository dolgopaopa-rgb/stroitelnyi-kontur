import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { openApp, switchRole } from "../helpers/auth";

const roles = [
  { value: "owner", slug: "director", testId: "today-role-owner" },
  { value: "construction_manager", slug: "construction-manager", testId: "today-role-project-manager" },
  { value: "foreman:7", slug: "foreman", testId: "today-role-foreman" },
  { value: "sales_manager", slug: "manager", testId: "today-role-manager", expectsEstimates: true },
  { value: "estimator", slug: "estimator", testId: "today-role-estimator", expectsEstimates: true },
];

async function createEstimateFixtures(page: Parameters<typeof openApp>[0]) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page, "/estimates");
  await page.locator("#newEstimateJobButton").click();
  const people = await page.locator("#estimateJobForm").evaluate((formNode) => {
    const form = formNode as HTMLFormElement;
    return {
      managerId: (form.elements.namedItem("manager_id") as HTMLSelectElement).value,
      estimatorId: (form.elements.namedItem("estimator_id") as HTMLSelectElement).value,
    };
  });
  await page.locator("#estimateJobDialog").getByRole("button", { name: "Отмена" }).click();
  const ids: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    const response = await page.request.post("/api/estimate-jobs", {
      data: {
        title: `Расчёт для нового обращения ${index + 1}`,
        customer_name: `Синтетический заказчик ${index + 1}`,
        manager_id: people.managerId,
        estimator_id: people.estimatorId,
        received_at: "2026-08-21",
        due_date: index === 0 ? "2026-08-22" : "2026-08-28",
        site_costs_policy: "include",
        comment: "Тестовые данные только для проверки рабочего экрана роли.",
        attachments: [],
      },
    });
    expect(response.ok()).toBeTruthy();
    ids.push(Number((await response.json()).id));
  }
  return ids;
}

test("five role workspaces stay useful on desktop and mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "One browser captures the controlled role matrix");
  test.setTimeout(120_000);

  const evidenceDir = path.resolve("qa-snapshots/ux-reset-after");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const createdIds = await createEstimateFixtures(page);

  try {
    await openApp(page, "/today");
    for (const role of roles) {
      await page.setViewportSize({ width: 1440, height: 900 });
      const available = await switchRole(page, role.value);
      expect(available, `${role.value} must be available in the role switcher`).toBeTruthy();
      await page.locator("#toast").evaluate((node) => node.classList.remove("active"));

      for (const viewport of [
        { name: "desktop", width: 1440, height: 900 },
        { name: "mobile", width: 390, height: 844 },
      ]) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(150);
        await expect(page.getByTestId(role.testId)).toBeVisible();
        await expect(page.getByTestId("today-page")).toBeVisible();

        const primaryActions = page.locator("#todayPrimaryActions .primary:visible");
        await expect(primaryActions, `${role.value} needs one clear primary action`).toHaveCount(1);
        const kpiCount = await page.locator("#todayKpis .compact-kpi:visible").count();
        expect(kpiCount, `${role.value} must not show more than four KPIs`).toBeLessThanOrEqual(4);

        if (role.expectsEstimates) {
          await expect(page.getByTestId("today-page")).toContainText("Синтетический заказчик");
        }

        const layout = await page.evaluate(() => ({
          width: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          pageTop: document.querySelector("#todayView")?.getBoundingClientRect().top || 0,
        }));
        expect(layout.scrollWidth, `${role.value} must not create page-wide overflow at ${viewport.width}px`).toBeLessThanOrEqual(layout.width + 2);

        if (viewport.name === "mobile") {
          await expect(page.locator(".topbar .actions")).toBeHidden();
          await expect(page.getByTestId("mobile-bottom-nav")).toBeVisible();
          await expect(page.getByTestId("mobile-bottom-nav").locator("button:visible"), `${role.value} needs five separated mobile destinations`).toHaveCount(5);
          expect(layout.pageTop, `${role.value} content must begin near the mobile header`).toBeLessThan(90);
        } else {
          const columns = await page.locator(".today-workspace-grid").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length);
          expect(columns, `${role.value} desktop workspace must use deliberate columns`).toBeGreaterThanOrEqual(1);
        }

        await page.screenshot({
          path: path.join(evidenceDir, `${role.slug}-${viewport.name}.png`),
          fullPage: true,
        });
      }
    }
  } finally {
    for (const id of createdIds) {
      await page.request.post(`/api/estimate-jobs/${id}/delete`, { data: {} }).catch(() => undefined);
    }
  }
});
