import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("regulated material request is rejected before creation when needed date is missing", async ({ page }) => {
  await openApp(page, "/materials");

  const result = await page.evaluate(async () => {
    const projectsResponse = await fetch("/api/projects", { cache: "no-store" });
    const projects = projectsResponse.ok ? await projectsResponse.json() : [];
    const project = projects.find((item: any) => item.status !== "archived") || projects[0];
    if (!project) return { error: "no_project" };
    const response = await fetch("/api/material-requests/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: project.id,
        creator_id: Number(project.foreman_id || 7),
        creator_role: "foreman",
        request_kind: "additional",
        estimate_stage: "QA: обязательные поля",
        additional_reason: "site_damage",
        comment: "QA request without needed date",
        extra_items: [
          {
            material: "QA",
            name: "Материал без даты поставки",
            unit: "шт",
            quantity: 1,
          },
        ],
      }),
    });
    return { status: response.status, text: await response.text() };
  });

  expect(result.error).toBeFalsy();
  expect(result.status).toBe(400);
  expect(result.text.toLowerCase()).toContain("дат");
});
