import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("blocker cards are structured when blockers exist", async ({ page }) => {
  await openApp(page, "/objects");
  const projectId = await page.evaluate(async () => {
    const projectsResponse = await fetch("/api/projects", { cache: "no-store" });
    const projects = await projectsResponse.json();
    const project = projects[0];
    if (!project) throw new Error("A synthetic project is required for blocker QA.");
    const response = await fetch("/api/blockers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: project.id,
        title: `QA blocker ${Date.now()}`,
        blocker_type: "other",
        severity: "medium",
      }),
    });
    if (!response.ok) throw new Error(`Could not create a synthetic blocker: ${response.status}`);
    return Number(project.id);
  });
  await openApp(page, "/objects");
  const projectButton = page.locator(`#projectRows [data-open-project="${projectId}"]`).first();
  await expect(projectButton).toBeVisible();
  await projectButton.click();
  await expect(page.locator("#projectDetail")).toBeVisible();
  const cards = page.locator('[data-testid="blocker-card"]');
  await expect(cards.first()).toBeVisible();
  await expect(cards.first().locator('[data-testid="blocker-type-badge"]')).toBeVisible();
  await expect(cards.first().locator('[data-testid="blocker-status-badge"]')).toBeVisible();
  await expect(cards.first().locator('[data-testid="blocker-severity-badge"]')).toBeVisible();
});
