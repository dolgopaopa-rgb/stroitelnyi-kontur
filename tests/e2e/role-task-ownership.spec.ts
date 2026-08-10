import { expect, test } from "@playwright/test";
import { openApp, switchRole } from "../helpers/auth";

test("tasks are grouped by role ownership and next responsibility", async ({ page }) => {
  await openApp(page, "/tasks");
  await switchRole(page, "owner");

  test.skip(!["127.0.0.1", "localhost"].includes(new URL(page.url()).hostname), "Synthetic task fixture is local-only.");
  const fixture = await page.evaluate(async () => {
    const [users, projects, tasks] = await Promise.all([
      fetch("/api/users", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/projects", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/tasks", { cache: "no-store" }).then((response) => response.json()),
    ]);
    const foreman = users.find((item: any) => item.role === "foreman");
    const owner = users.find((item: any) => item.role === "owner");
    const project = projects.find((item: any) => item.status !== "archived") || projects[0];
    if (!foreman || !owner || !project) return { error: "fixture_context_missing" };
    const existing = tasks.find(
      (item: any) => Number(item.assignee_id) === Number(foreman.id) && Number(item.creator_id) === Number(owner.id) && item.status !== "accepted"
    );
    if (!existing) {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          title: "QA: задача прорабу",
          assignee_id: foreman.id,
          creator_id: owner.id,
          reviewer_id: owner.id,
          creator_role: "owner",
          task_type: "task",
          priority: "normal",
          due_date: new Date().toISOString().slice(0, 10),
        }),
      });
      if (!response.ok) return { error: `create:${response.status}:${await response.text()}` };
    }
    return { ok: true, foremanId: foreman.id };
  });
  expect(fixture.error).toBeFalsy();

  await openApp(page, "/tasks");
  const ownerSections = page.locator('[data-testid="task-workflow-section"]');
  await expect(ownerSections.first()).toBeVisible();
  await expect(page.locator("#taskRows")).toContainText(/Я поставил|Мне нужно проверить|На моих объектах|Мне нужно сделать/);

  await switchRole(page, `foreman:${fixture.foremanId}`);
  await openApp(page, "/tasks");
  await expect(page.locator('[data-task-workflow="my_action"]').first()).toBeVisible();
  await expect(page.locator("#taskRows")).toContainText("Мне нужно сделать");
});
