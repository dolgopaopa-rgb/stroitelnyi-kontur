import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("blocker cards are structured when blockers exist", async ({ page }) => {
  await openApp(page, "/objects");
  const projectsResponse = await page.request.get("/api/projects");
  expect(projectsResponse.ok()).toBeTruthy();
  const projects = await projectsResponse.json();
  expect(projects.length, "The blocker check needs a selected project").toBeGreaterThan(0);
  await openApp(page, `/objects?project=${projects[0].id}`);
  await expect(page.locator("#projectDetail")).toBeVisible();
  const cards = page.locator('[data-testid="blocker-card"]');
  if (!(await cards.count())) {
    await expect(page.locator("#projectDetail")).toBeVisible();
    return;
  }
  await expect(cards.first().locator('[data-testid="blocker-type-badge"]')).toBeVisible();
  await expect(cards.first().locator('[data-testid="blocker-status-badge"]')).toBeVisible();
  await expect(cards.first().locator('[data-testid="blocker-severity-badge"]')).toBeVisible();
});
