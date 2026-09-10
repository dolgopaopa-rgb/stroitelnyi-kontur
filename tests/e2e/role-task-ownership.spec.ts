import { expect, test, type Page } from "@playwright/test";
import { openApp, switchRole } from "../helpers/auth";

test.use({ serviceWorkers: "block" });

const owner = { id: 1, role: "owner", name: "Synthetic owner" };
const master = { id: 9042, role: "master", name: "Synthetic master" };
const estimator = { id: 9005, role: "estimator", name: "Synthetic estimator" };
const project = { id: 9001, title: "Synthetic ownership project", status: "in_progress" };

async function installOwnershipFixtures(page: Page, withMaster: boolean) {
  const common = {
    project_id: project.id,
    project_title: project.title,
    task_type: "task",
    priority: "normal",
    due_date: "2099-12-31",
    created_at: "2026-09-10 09:00:00",
    creator_id: owner.id,
    creator_role: owner.role,
    creator_name: owner.name,
    reviewer_id: owner.id,
    reviewer_role: owner.role,
    reviewer_name: owner.name,
    assignee_id: master.id,
    assignee_role: master.role,
    assignee_name: master.name,
    events: [],
    attachments: [],
  };
  const foreign = {
    ...common,
    assignee_id: estimator.id,
    assignee_role: estimator.role,
    assignee_name: estimator.name,
    creator_id: null,
    creator_role: null,
    creator_name: null,
    reviewer_id: null,
    reviewer_role: null,
    reviewer_name: null,
  };
  const tasks = withMaster ? [
    { ...common, id: 9101, title: "Synthetic master action", status: "new" },
    { ...common, id: 9102, title: "Synthetic master awaiting review", status: "waiting_check", submitted_at: "2026-09-10 10:00:00" },
    { ...foreign, id: 9103, title: "Synthetic estimator action", status: "in_progress" },
  ] : [
    { ...foreign, id: 9201, title: "Synthetic unowned action", status: "in_progress" },
    { ...foreign, id: 9202, title: "Synthetic unowned review", status: "waiting_check", submitted_at: "2026-09-10 10:00:00" },
  ];
  // Isolate UI ownership from shared seed mutations without altering the real session.
  for (const [path, body] of [
    ["/api/users", withMaster ? [owner, master, estimator] : [owner, estimator]],
    ["/api/projects", [project]],
    ["/api/tasks", tasks],
  ] as const) {
    await page.route((url) => url.pathname === path, (route) => route.fulfill({ json: body }));
  }
}

async function selectPreviewRole(page: Page, role: string) {
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 1366, height: 900 });
  expect(await switchRole(page, role), "Ownership QA requires an enabled preview role picker").toBe(true);
  await expect(page.locator("#currentRoleSelect")).toHaveValue(role);
  await expect(page.locator("#todayView")).toHaveAttribute("data-role", role);
  if (viewport) await page.setViewportSize(viewport);
}

test("tasks are grouped by role ownership and next responsibility", async ({ page }) => {
  await installOwnershipFixtures(page, true);
  await openApp(page, "/tasks");
  await selectPreviewRole(page, "owner");

  const rows = page.locator("#taskRows");
  await expect(rows.locator('[data-task-workflow="created_by_me"]')).toContainText("Synthetic master action");
  const ownerReview = rows.locator('[data-task-workflow="my_review"]');
  await expect(ownerReview).toBeVisible();
  await expect(ownerReview).toContainText("Synthetic master awaiting review");
  await expect(ownerReview).not.toContainText("Synthetic master action");
  await ownerReview.locator("summary").click();
  await expect(ownerReview.locator('[data-task-action="accept"]')).toBeVisible();
  await expect(ownerReview.locator('[data-task-action="return"]')).toBeVisible();

  await selectPreviewRole(page, "master");

  const action = rows.locator('[data-task-workflow="my_action"]');
  const waiting = rows.locator('[data-task-workflow="waiting"]');
  await expect(action).toBeVisible();
  await expect(action).toContainText("Мне нужно сделать");
  await expect(action).toContainText("Synthetic master action");
  await expect(action).not.toContainText("Synthetic master awaiting review");
  await action.locator("summary").click();
  await expect(action.locator('[data-task-action="start"]')).toBeVisible();
  await expect(waiting).toContainText("Synthetic master awaiting review");
  await expect(waiting).toContainText("Я жду");
  await expect(waiting.locator('[data-task-action="accept"], [data-task-action="return"]')).toHaveCount(0);
  await expect(rows.locator('[data-task-workflow="my_review"]')).toHaveCount(0);
  await expect(rows).not.toContainText("Synthetic estimator action");
});

test("master preview without an account cannot claim null task ownership or review privileges", async ({ page }) => {
  await installOwnershipFixtures(page, false);
  await openApp(page, "/tasks");
  await selectPreviewRole(page, "master");

  const rows = page.locator("#taskRows");
  const other = rows.locator('[data-task-workflow="other"]');
  await expect(other).toBeVisible();
  await expect(other.locator('[data-testid="task-card"]')).toHaveCount(2);
  await expect(rows).toContainText("Synthetic unowned action");
  await expect(rows).toContainText("Synthetic unowned review");
  await expect(rows).not.toContainText("Я поставил");
  await expect(rows).not.toContainText("Требуется ваша проверка");
  await expect(rows.locator('[data-task-workflow="my_action"], [data-task-workflow="my_review"], [data-task-workflow="created_by_me"]')).toHaveCount(0);
  const review = other.locator('[data-testid="task-card"]').filter({ hasText: "Synthetic unowned review" });
  await review.locator("summary").click();
  await expect(review.getByRole("button", { name: "Ожидается проверка", exact: true })).toBeDisabled();
  await expect(rows.locator("[data-task-action]")).toHaveCount(0);
});
