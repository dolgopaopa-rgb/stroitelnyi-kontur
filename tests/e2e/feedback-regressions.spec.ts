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

test("estimate creation ignores a double submit and uploads a large file set in batches", async ({ page }) => {
  let createRequests = 0;
  const uploadedBatchSizes: number[] = [];
  const syntheticJobId = 987654;
  const duplicateJobs = [1, 2].map((id) => ({
    id,
    title: "Заказчик - Терраса",
    customer_name: "Заказчик",
    manager_id: 1,
    manager_name: "Менеджер QA",
    estimator_id: 2,
    estimator_name: "Сметчик QA",
    received_at: "2026-08-07",
    due_date: "2026-08-10",
    status: "estimate_new",
    estimate_type: "primary",
    site_costs_policy: "include",
    files: [{ id: id * 10, file_name: "plan.pdf", is_current: 1 }],
  }));
  await page.route("**/api/estimate-jobs", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(duplicateJobs) });
      return;
    }
    if (route.request().method() !== "POST") return route.continue();
    createRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 80));
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: syntheticJobId }) });
  });
  await page.route(`**/api/estimate-jobs/${syntheticJobId}/files`, async (route) => {
    const payload = route.request().postDataJSON() as { attachments?: unknown[] };
    const count = payload.attachments?.length || 0;
    uploadedBatchSizes.push(count);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ files: Array.from({ length: count }, (_, index) => ({ id: uploadedBatchSizes.length * 100 + index })) }),
    });
  });

  await openApp(page, "/estimates");
  await expect(page.locator('[data-testid="estimates-page"]')).toHaveClass(/active/);
  await expect(page.locator('[data-testid="estimate-duplicate-group"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="estimate-duplicate-group"]')).toContainText("Совпадающих записей: 2");
  await expect(page.locator('[data-testid="estimate-job-card"]:visible')).toHaveCount(1);
  await expect(page.locator('[data-testid="estimate-job-card"]')).toHaveCount(2);

  await page.locator("#newEstimateJobButton").click();
  const form = page.locator("#estimateJobForm");
  await form.locator('[name="title"]').fill(`Проверка двойного нажатия ${Date.now()}`);
  await form.locator('[name="customer_name"]').fill("Тестовый заказчик QA");
  await form.locator('[name="due_date"]').fill("2026-08-20");
  for (const field of ["manager_id", "estimator_id"]) {
    await form.locator(`[name="${field}"]`).evaluate((select: HTMLSelectElement) => {
      const option = [...select.options].find((item) => Boolean(item.value) && !item.disabled);
      if (!option) throw new Error(`No available option for ${select.name}`);
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  await form.locator('[name="attachments"]').setInputFiles(
    Array.from({ length: 12 }, (_, index) => ({
      name: `estimate-${index + 1}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(`file-${index + 1}`),
    }))
  );

  await form.evaluate((node: HTMLFormElement) => {
    node.requestSubmit();
    node.requestSubmit();
  });

  await expect(page.locator("#estimateJobDialog")).not.toHaveAttribute("open", "");
  expect(createRequests).toBe(1);
  expect(uploadedBatchSizes).toEqual([5, 5, 2]);

  const app = readProjectFile("app/static/app.js");
  expect(app).toContain('form.dataset.submitting === "true"');
  expect(app).toContain("findDuplicateEstimateJob");
  expect(app).toContain("uploadEstimateFilesInBatches");
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

test("material requests show ordered estimate positions and support partial procurement acceptance", async () => {
  const app = readProjectFile("app/static/app.js");
  const compat = readProjectFile("app/static/app.compat.js");
  const server = readProjectFile("app/server.py");

  for (const source of [app, compat]) {
    expect(source).toContain("estimateMaterialRequestSummary");
    expect(source).toContain("В заявках:");
    expect(source).toContain("renderMaterialAcceptSelection");
    expect(source).toContain("collectMaterialAcceptItemIds");
    expect(source).toContain("Снятые позиции уйдут в отдельную отложенную заявку");
    expect(source).toContain("Укажите количество для выбранных позиций");
  }

  expect(server).toContain("request_summary_rows");
  expect(server).toContain("accept_item_ids");
  expect(server).toContain("postponed_batch_id");
  expect(server).toContain("'postponed', 'approved', 'at_risk'");
  expect(server).toContain("В работу взято позиций");
});

test("main estimate materials list is visible for procurement by default", async () => {
  const html = readProjectFile("app/static/index.html");
  const app = readProjectFile("app/static/app.js");
  const compat = readProjectFile("app/static/app.compat.js");
  const server = readProjectFile("app/server.py");

  expect(html).toContain('id="toggleEstimateMaterialsButton"');
  expect(html).toContain('id="refreshEstimateButton"');
  expect(html).toContain('id="estimateMaterialRows"');
  expect(app).toContain("showEstimateMaterials: true");
  expect(app).toContain("state.showEstimateMaterials = true;");
  expect(app).toContain("await renderEstimateMaterials();");
  expect(server).toContain("SUM(COALESCE(m.requested_quantity, 0)) AS requested_quantity");

  for (const source of [app, compat]) {
    expect(source).toContain("renderEstimateMaterials");
    expect(source).toContain("estimateMaterialRows");
    expect(source).toContain("toggleEstimateMaterialsButton");
  }
});

test("completed estimates expose a direct Smetter link edit action", async () => {
  const app = readProjectFile("app/static/app.js");
  const compat = readProjectFile("app/static/app.compat.js");
  const server = readProjectFile("app/server.py");

  for (const source of [app, compat]) {
    expect(source).toContain('data-estimate-file-mode="link"');
    expect(source).toContain('modeOverride === "link"');
    expect(source).toContain("Ссылка на Сметтер");
  }
  expect(app).toContain('openEstimateJobFileDialog(openEstimateFilesButton.dataset.openEstimateFiles, "", openEstimateFilesButton.dataset.estimateFileMode || "")');
  expect(server).toContain('smetter_url = str(data.get("smetter_url") or "").strip()');
  expect(server).toContain("UPDATE estimate_jobs SET smetter_url = ?");
});

test("estimate comments stay full length and can be edited after submission", async () => {
  const html = readProjectFile("app/static/index.html");
  const app = readProjectFile("app/static/app.js");
  const compat = readProjectFile("app/static/app.compat.js");
  const styles = readProjectFile("app/static/styles.css");
  const server = readProjectFile("app/server.py");

  expect(html).toContain('textarea name="result_comment"');
  expect(app).toContain('data-estimate-file-mode="comment"');
  expect(app).toContain("Комментарий сметчика");
  expect(app).toContain("resultCommentChanged");
  expect(compat).toContain('data-estimate-file-mode="comment"');
  expect(compat).toContain("Комментарий сметчика");
  expect(styles).toContain("#estimatesView .estimate-job-main p");
  expect(styles).toContain("overflow: visible");
  expect(styles).toContain("text-overflow: clip");
  expect(server).toContain('result_comment_present = "result_comment" in data');
  expect(server).toContain("UPDATE estimate_jobs SET result_comment = ?");
});

test("feedback delete controls are available only to owner", async ({ page }) => {
  const externalId = `e2e-feedback-delete-${Date.now()}-${Math.random()}`;
  const createResponse = await page.request.post("/api/feedback", {
    data: {
      source: "e2e",
      external_id: externalId,
      sender_name: "E2E",
      text: "Проверка кнопки удаления обратной связи",
      attachments: [],
    },
  });
  expect(createResponse.ok()).toBeTruthy();

  await openApp(page, "/feedback");
  await switchRole(page, "owner");
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
  expect(server).toContain("feedback_ingest_request_authorized");
  expect(server).toContain("if not can_manage_feedback(account):");
});

test("MAX feedback webhook accepts one latest message without browser session and deduplicates it", async ({ page }) => {
  const externalId = `max-ksenia-latest-${Date.now()}-${Math.random()}`;
  const payload = {
    source: "max",
    message: {
      id: externalId,
      text: "Ксения: последнее замечание по смете для проверки импорта из MAX.",
      chat: { id: "-74707261482336", title: "Рабочий чат MAX" },
      sender: { id: "ksenia-estimator", name: "Ксения" },
      attachments: [{ title: "Скриншот замечания", type: "image" }],
    },
  };

  const createResponse = await page.request.post("/api/feedback/max", {
    headers: { "X-Feedback-Token": process.env.MAX_FEEDBACK_INGEST_TOKEN || "e2e-feedback-ingest-token" },
    data: payload,
  });
  expect(createResponse.status()).toBe(201);
  const created = await createResponse.json();
  expect(created.duplicate).toBeFalsy();

  const duplicateResponse = await page.request.post("/api/feedback/max", {
    headers: { "X-Feedback-Token": process.env.MAX_FEEDBACK_INGEST_TOKEN || "e2e-feedback-ingest-token" },
    data: payload,
  });
  expect(duplicateResponse.status()).toBe(200);
  const duplicate = await duplicateResponse.json();
  expect(duplicate.duplicate).toBeTruthy();
  expect(duplicate.id).toBe(created.id);

  const queryTokenResponse = await page.request.post("/api/feedback/max?token=e2e-feedback-ingest-token", {
    data: {
      source: "max",
      message: {
        id: `${externalId}-query-token`,
        text: "Ксения: проверка импорта через webhook URL.",
        chat: { id: "-74707261482336", title: "Рабочий чат MAX" },
        sender: { id: "ksenia-estimator", name: "Ксения" },
      },
    },
  });
  expect(queryTokenResponse.status()).toBe(201);

  const server = readProjectFile("app/server.py");
  expect(server).toContain("feedback_ingest_request_authorized(self)");
  expect(server).toContain("if not feedback_ingest_request_authorized(self) and not can_ingest_feedback(account):");
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

test("estimate job files are collapsed under object summary", async () => {
  const html = readProjectFile("app/static/index.html");
  const app = readProjectFile("app/static/app.js");
  const compat = readProjectFile("app/static/app.compat.js");
  const styles = readProjectFile("app/static/styles.css");

  expect(html).toContain("20260711-main-estimate-materials");
  expect(app).toContain("estimate-job-collapsible");
  expect(app).toContain("estimate-job-summary");
  expect(app).toContain("estimate-job-body");
  expect(app).toContain("data-collapsible-key");
  expect(app).toContain("Файлы:");
  expect(app).toContain('data-media-preview="${previewKind}"');
  expect(app).toContain(".estimate-job-files");
  expect(html).toContain("Закрыть просмотр");
  expect(compat).toContain("estimate-job-collapsible");
  expect(compat).toContain("data-media-preview");
  expect(compat).toContain(".estimate-job-files");
  expect(styles).toContain(".estimate-job-collapsible");
  expect(styles).toContain(".estimate-job-summary");
  expect(styles).toContain(".estimate-job-body");
});

test("estimate file replacement cannot silently fail", async ({ page }) => {
  await openApp(page, "/estimates");

  const html = readProjectFile("app/static/index.html");
  const app = readProjectFile("app/static/app.js");
  const server = readProjectFile("app/server.py");

  expect(html).toContain('id="estimateJobFileForm"');
  expect(html).toContain('value="replace"');
  expect(app).toContain("Для замены выберите новую версию файла");
  expect(app).toContain("Сохраняем новую версию файла");
  expect(app).toContain("Файл не сохранился. Попробуйте ещё раз или сообщите в чат.");
  expect(app).toContain("submitButton.disabled = true");
  expect(server).toContain("Для замены выберите новую версию файла");
  expect(server).toContain("Не удалось сохранить новую версию файла");
  expect(server).toContain("Не удалось сохранить файлы сметы");
});

test("sales manager sees submitted estimate notification", async ({ page }) => {
  await openApp(page, "/today");

  const html = readProjectFile("app/static/index.html");
  const app = readProjectFile("app/static/app.js");
  const styles = readProjectFile("app/static/styles.css");

  expect(html).toContain('id="managerEstimateNoticePanel"');
  expect(html).toContain('id="managerEstimateNoticeDialog"');
  expect(html).toContain("Новые сданные сметы");
  expect(app).toContain("function submittedEstimateJobsForManager");
  expect(app).toContain('currentRoleBase() !== "sales_manager"');
  expect(app).toContain('job.status === "estimate_done"');
  expect(app).toContain('isOwnEstimateJob(job, "manager_id")');
  expect(app).toContain("managerEstimateNoticeStorageKey");
  expect(app).toContain("data-open-manager-estimate-notice");
  expect(app).toContain("data-manager-estimate-open-section");
  expect(styles).toContain(".manager-estimate-notice-panel");
  expect(styles).toContain(".manager-estimate-notice-item");
});

test("delivered material batches do not stay in delivery risk", async ({ page }) => {
  await openApp(page, "/materials");

  const html = readProjectFile("app/static/index.html");
  const app = readProjectFile("app/static/app.js");
  const compat = readProjectFile("app/static/app.compat.js");
  const server = readProjectFile("app/server.py");

  expect(html).toContain("20260711-main-estimate-materials");
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
