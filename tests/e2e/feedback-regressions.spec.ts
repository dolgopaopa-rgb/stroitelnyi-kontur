import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openApp, switchRole } from "../helpers/auth";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("estimate completion supports multiple files and return to rework", async ({ page }) => {
  await openApp(page, "/estimates");

  const html = readProjectFile("app/static/index.html");
  const app = readProjectFile("app/static/app.js");
  const server = readProjectFile("app/server.py");

  expect(html).toContain('id="estimateJobDoneForm"');
  expect(html).toContain('name="attachments" type="file" multiple');
  expect(app).toContain('data-estimate-job-status="estimate_returned"');
  expect(app).toContain("Вернуть на доработку");
  expect(server).toContain('status == "estimate_returned"');
  expect(server).toContain('row["status"] == "estimate_done"');
  expect(server).toContain('row["status"] in {"estimate_in_work", "estimate_question", "estimate_returned"}');
});

test("extra work items can be edited before final decision", async ({ page }) => {
  await openApp(page, "/works");

  const html = readProjectFile("app/static/index.html");
  const app = readProjectFile("app/static/app.js");
  const server = readProjectFile("app/server.py");

  expect(html).toContain('id="workExtraSubmitButton"');
  expect(html).toContain('id="cancelWorkExtraEditButton"');
  expect(app).toContain("fillWorkExtraForm");
  expect(app).toContain("data-edit-work-extra");
  expect(app).toContain("canEditWorkExtraState");
  expect(server).toContain('^/api/work-extra-items/(\\d+)/update$');
  expect(server).toContain("Эту работу уже нельзя менять: по ней принято решение.");
});

test("feedback delete controls are available only to owner", async ({ page }) => {
  await openApp(page, "/feedback");
  expect(await switchRole(page, "owner")).toBeTruthy();
  await expect(page.locator("#feedbackView")).toHaveClass(/active/);
  await expect(page.locator("#deleteSelectedFeedbackButton")).toBeVisible();
  await expect(page.locator("[data-feedback-delete]").first()).toBeVisible();

  expect(await switchRole(page, "construction_manager")).toBeTruthy();
  await expect(page.locator("#deleteSelectedFeedbackButton")).toBeHidden();
  await expect(page.locator("[data-feedback-delete]")).toHaveCount(0);

  expect(await switchRole(page, "finance_director")).toBeTruthy();
  await expect(page.locator("#deleteSelectedFeedbackButton")).toBeHidden();
  await expect(page.locator("[data-feedback-delete]")).toHaveCount(0);

  const app = readProjectFile("app/static/app.js");
  const server = readProjectFile("app/server.py");

  expect(app).toContain('currentRoleBase() === "owner"');
  expect(app).toContain("data-feedback-delete");
  expect(app).toContain("/api/feedback/delete-bulk");
  expect(server).toContain('account_role(account) == "owner"');
  expect(server).toContain('path == "/api/feedback/delete-bulk"');
  expect(server).toContain('^/api/feedback/(\\d+)/delete$');
});

test("feedback ingest is separated from feedback management", async ({ page }) => {
  await openApp(page, "/feedback");

  const server = readProjectFile("app/server.py");

  expect(server).toContain("def can_ingest_feedback");
  expect(server).toContain("not is_read_only_account(account)");
  expect(server).toContain("if not can_ingest_feedback(account):");
  expect(server).toContain("if not can_manage_feedback(account):");
});

test("brand link opens home and compact topbar controls stay readable", async ({ page }) => {
  await page.setViewportSize({ width: 936, height: 650 });
  await openApp(page, "/feedback");

  await expect(page.locator(".brand")).toHaveAttribute("href", "/today");
  await page.locator(".brand").click();
  await expect(page).toHaveURL(/\/today/);
  await expect(page.locator("#todayView")).toHaveClass(/active/);

  const layout = await page.evaluate(() => {
    const labels = [".topbar-object-switch", ".global-search", ".density-switcher", ".role-switcher"];
    return labels.map((selector) => {
      const node = document.querySelector(selector);
      const box = node?.getBoundingClientRect();
      return {
        selector,
        width: Math.round(box?.width || 0),
        height: Math.round(box?.height || 0),
        visible: Boolean(box && box.width > 0 && box.height > 0),
      };
    });
  });

  for (const item of layout) {
    expect(item.visible, `${item.selector} must be visible`).toBeTruthy();
    expect(item.width, `${item.selector} must not collapse in narrow desktop`).toBeGreaterThanOrEqual(120);
  }
});

test("estimate jobs have archive mode and project card can be collapsed explicitly", async ({ page }) => {
  await openApp(page, "/estimates");

  const html = readProjectFile("app/static/index.html");
  const app = readProjectFile("app/static/app.js");
  const server = readProjectFile("app/server.py");

  expect(html).toContain('data-estimate-list-mode="archive"');
  expect(app).toContain("visibleEstimateJobs");
  expect(app).toContain('data-estimate-job-status="archived"');
  expect(app).toContain("canArchiveEstimateJob");
  expect(server).toContain('"archived"');
  expect(server).toContain("status NOT IN ('estimate_done', 'archived')");

  expect(app).toContain("data-collapse-project-detail");
  expect(app).toContain("Карточка объекта свернута");
});

test("estimate job files are collapsed under object summary", async ({ page }) => {
  await openApp(page, "/estimates");

  const html = readProjectFile("app/static/index.html");
  const app = readProjectFile("app/static/app.js");
  const compat = readProjectFile("app/static/app.compat.js");
  const styles = readProjectFile("app/static/styles.css");

  expect(html).toContain("20260704-material-risk-final");
  expect(app).toContain("estimate-job-collapsible");
  expect(app).toContain("estimate-job-summary");
  expect(app).toContain("estimate-job-body");
  expect(app).toContain("data-collapsible-key");
  expect(app).toContain("Файлы:");
  expect(compat).toContain("estimate-job-collapsible");
  expect(styles).toContain(".estimate-job-collapsible");
  expect(styles).toContain(".estimate-job-summary");
  expect(styles).toContain(".estimate-job-body");
});

test("delivered material batches do not stay in delivery risk", async ({ page }) => {
  await openApp(page, "/materials");

  const html = readProjectFile("app/static/index.html");
  const app = readProjectFile("app/static/app.js");
  const compat = readProjectFile("app/static/app.compat.js");
  const server = readProjectFile("app/server.py");

  expect(html).toContain("20260704-material-risk-final");
  expect(app).toContain("function materialBatchHasOpenProblem");
  expect(app).toContain("function materialBatchIsFinalForAttention");
  expect(app).toContain("if (materialBatchIsFinalForAttention(batch)) return false");
  expect(app).toContain("batch_is_blocker");
  expect(compat).toContain("materialBatchHasOpenProblem");
  expect(server).toContain("def snapshot_material_has_open_problem");
  expect(server).toContain("COALESCE(b.stage, '') NOT IN ('delivered', 'closed', 'cancelled')");
  expect(server).toContain("COALESCE(b.status, '') NOT IN ('received', 'closed', 'archived', 'cancelled')");
  expect(server).toContain("b.is_blocker AS batch_is_blocker");
});
