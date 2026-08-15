import { expect, test } from "@playwright/test";
import { openApp, switchRole } from "../helpers/auth";

test("tasks are grouped by role ownership and next responsibility", async ({ page }) => {
  await openApp(page, "/tasks");
  await switchRole(page, "owner");
  const fixture = await page.evaluate(async () => {
    const [projectsResponse, usersResponse] = await Promise.all([
      fetch("/api/projects", { cache: "no-store" }),
      fetch("/api/users", { cache: "no-store" }),
    ]);
    const projects = await projectsResponse.json();
    const users = await usersResponse.json();
    const project = projects[0];
    const owner = users.find((user: any) => user.role === "owner");
    const assignee = users.find((user: any) => user.role === "foreman");
    if (!project || !owner || !assignee) throw new Error("Synthetic owner, assignee and project fixtures are required.");
    const title = `QA role ownership ${Date.now()}`;
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: project.id,
        title,
        creator_id: owner.id,
        reviewer_id: owner.id,
        assignee_id: assignee.id,
        task_type: "task",
        priority: "normal",
      }),
    });
    if (!response.ok) throw new Error(`Could not create role ownership fixture: ${response.status}`);
    const created = await response.json();
    return { title, taskId: Number(created.id), projectId: Number(project.id) };
  });
  try {
    await openApp(page, "/tasks");
    await page.locator(`[data-task-project="${fixture.projectId}"]`).click();

    const ownerSections = page.locator('[data-testid="task-workflow-section"]');
    await expect(ownerSections.first()).toBeVisible();
    const ownerGroup = page.locator('[data-task-workflow="created_by_me"]');
    await expect(ownerGroup).toBeVisible();
    await expect(ownerGroup).toContainText(fixture.title);

    const foremanRole = await page.evaluate(async () => {
      const users = await (await fetch("/api/users", { cache: "no-store" })).json();
      const foreman = users.find((user: any) => user.role === "foreman");
      return foreman ? `foreman:${foreman.id}` : "";
    });
    expect(foremanRole).toBeTruthy();
    await switchRole(page, foremanRole);
    await openApp(page, "/tasks");
    await page.locator(`[data-task-project="${fixture.projectId}"]`).click();

    const assigneeGroup = page.locator('[data-task-workflow="my_action"]');
    await expect(assigneeGroup).toBeVisible();
    await expect(assigneeGroup).toContainText(fixture.title);
  } finally {
    await page
      .evaluate(async (taskId) => {
        await fetch(`/api/tasks/${taskId}/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      }, fixture.taskId)
      .catch(() => undefined);
  }
});
