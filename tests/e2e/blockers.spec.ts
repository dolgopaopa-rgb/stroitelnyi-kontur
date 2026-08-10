import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("blocker cards are structured when blockers exist", async ({ page }) => {
  await openApp(page, "/objects");
  test.skip(!["127.0.0.1", "localhost"].includes(new URL(page.url()).hostname), "Synthetic blocker fixture is local-only.");
  const fixture = await page.evaluate(async () => {
    const projects = await (await fetch("/api/projects", { cache: "no-store" })).json();
    const project = projects.find((item: any) => item.status !== "archived") || projects[0];
    if (!project) return { error: "no_project" };
    const blockers = await (await fetch(`/api/blockers?project_id=${project.id}`, { cache: "no-store" })).json();
    if (!blockers.length) {
      const response = await fetch("/api/blockers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          title: "QA: тестовый блокер",
          blocker_type: "no_material",
          severity: "high",
        }),
      });
      if (!response.ok) return { error: `create:${response.status}:${await response.text()}` };
    }
    return { projectId: project.id };
  });
  expect(fixture.error).toBeFalsy();
  await page.reload({ waitUntil: "domcontentloaded" });
  await openApp(page, "/objects");
  await page.locator(`#projectsView [data-open-project="${fixture.projectId}"]`).click();
  await expect(page.locator("#projectDetail")).toBeVisible();
  const cards = page.locator('#projectDetail [data-testid="blocker-card"]');
  await expect(cards.first()).toBeVisible();
  await expect(cards.first().locator('[data-testid="blocker-type-badge"]')).toBeVisible();
  await expect(cards.first().locator('[data-testid="blocker-status-badge"]')).toBeVisible();
  await expect(cards.first().locator('[data-testid="blocker-severity-badge"]')).toBeVisible();
});
