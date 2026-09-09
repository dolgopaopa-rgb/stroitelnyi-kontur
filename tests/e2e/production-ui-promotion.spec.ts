import { expect, test as base } from "@playwright/test";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openApp } from "../helpers/auth";

const appOrigin = "http://127.0.0.1:8765";
const staticRoot = fileURLToPath(new URL("../../app/static/", import.meta.url));
const users = [
  { id: 101, role: "sales_manager", name: "Promotion QA Manager" },
  { id: 102, role: "estimator", name: "Promotion QA Estimator" },
  { id: 103, role: "procurement_manager", name: "Promotion QA Procurement" },
];
type Role = "sales_manager" | "estimator" | "procurement_manager";

const files = [
  { id: 9701, file_name: "promotion-current.txt", title: "Current QA file", mime_type: "text/plain", is_current: 1, version_no: 2 },
  { id: 9702, file_name: "promotion-previous.txt", title: "Previous QA file", mime_type: "text/plain", is_current: 0, version_no: 1 },
];
const jobs = [
  { id: 901, title: "Promotion QA active", status: "estimate_in_work", due_date: "2099-12-31" },
  { id: 902, title: "Promotion QA overdue", status: "estimate_new", due_date: "2020-01-01" },
  { id: 903, title: "Promotion QA submitted", status: "estimate_done", due_date: "2020-01-01" },
  { id: 904, title: "Promotion QA archived", status: "archived", due_date: "2020-01-01" },
].map((job) => ({
  ...job,
  project_title: job.title,
  manager_id: 101,
  estimator_id: 102,
  manager_name: users[0].name,
  estimator_name: users[1].name,
  customer_name: "Synthetic QA customer",
  received_at: "2020-01-01",
  delivered_at: job.status === "estimate_done" ? "2026-09-01" : null,
  comment: "Synthetic promotion regression comment.",
  result_comment: job.status === "estimate_done" ? "Synthetic submitted result." : "",
  files: job.id === 903 ? files : [],
}));

const materialRows = [8101, 8102].map((id) => ({
  id,
  batch_id: 801,
  project_id: 800,
  project_title: "Synthetic material project",
  title: `Synthetic material ${id}`,
  creator_id: 104,
  creator_name: "Promotion QA Foreman",
  batch_status: "new",
  batch_stage: "request",
  batch_health: "normal",
  batch_created_at: "2026-09-01 09:00:00",
  needed_at: "2099-12-31",
  basis_type: "main_estimate",
  requested_quantity: 2,
  requested_unit: "pcs",
  estimated_quantity: 2,
  unit_price: 10,
  total_amount: 20,
}));

type AcceptPayload = {
  accept_item_ids: number[];
  comment: string;
  actor_role: string;
  actor_id: number;
};
type OfflineApp = {
  load: (role?: Role, path?: string) => Promise<void>;
  acceptRequests: AcceptPayload[];
};

const test = base.extend<{ offlineApp: OfflineApp }>({
  offlineApp: async ({ page }, use) => {
    let role: Role = "estimator";
    const acceptRequests: AcceptPayload[] = [];
    const unexpectedRequests: string[] = [];
    const pageErrors: string[] = [];
    const emptyLists = new Set([
      "/api/projects", "/api/projects/archive", "/api/photo-reports", "/api/object-remarks",
      "/api/blockers", "/api/tasks", "/api/notifications", "/api/estimate-materials",
      "/api/variations", "/api/contracts", "/api/document-folders", "/api/documents",
      "/api/feedback", "/api/events", "/api/work-items", "/api/work-extra-items",
    ]);
    page.on("pageerror", (error) => pageErrors.push(error.message));

    // The first request of a popup bypasses page.route, so block it at context level.
    await page.context().route("**/*", async (route) => {
      const request = route.request();
      unexpectedRequests.push(`Outside the mocked page: ${request.method()} ${request.url()}`);
      await route.fulfill({ status: 501, json: { error: "Network is disabled for promotion tests" } });
    });

    // No request falls through to a server, including documents and static assets.
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const key = `${request.method()} ${url.pathname}`;
      if (url.origin === appOrigin) {
        if (key === "POST /api/material-request-batches/801/accept") {
          acceptRequests.push(request.postDataJSON() as AcceptPayload);
          await route.fulfill({ json: { ok: true } });
          return;
        }
        if (request.method() === "GET") {
          if (["/today", "/estimates", "/materials"].includes(url.pathname)) {
            await route.fulfill({ path: resolve(staticRoot, "index.html") });
            return;
          }
          if (url.pathname.startsWith("/static/")) {
            const asset = resolve(staticRoot, decodeURIComponent(url.pathname.slice("/static/".length)));
            const localPath = relative(staticRoot, asset);
            if (localPath && !localPath.startsWith("..") && !isAbsolute(localPath)) {
              await route.fulfill({ path: asset });
              return;
            }
          }
          if (url.pathname === "/favicon.ico") {
            await route.fulfill({ status: 204 });
            return;
          }
          const file = files.find((item) => url.pathname === `/api/estimate-job-files/${item.id}/download`);
          if (file) {
            await route.fulfill({ contentType: "text/plain; charset=utf-8", body: `Synthetic preview: ${file.file_name}` });
            return;
          }
          if (url.pathname === "/api/session") {
            await route.fulfill({ json: { role, user: users.find((user) => user.role === role), can_switch_role: false } });
            return;
          }
          if (url.pathname === "/api/users") {
            await route.fulfill({ json: users });
            return;
          }
          if (url.pathname === "/api/estimate-jobs") {
            await route.fulfill({ json: jobs });
            return;
          }
          if (url.pathname === "/api/material-requests") {
            await route.fulfill({ json: role === "procurement_manager" && url.searchParams.get("archive") !== "1" ? materialRows : [] });
            return;
          }
          if (url.pathname === "/api/summary") {
            await route.fulfill({ json: { projects: 0, pending_handover: 0, estimate_jobs_open: 2, estimate_jobs_overdue: 1 } });
            return;
          }
          if (url.pathname === "/api/locations") {
            await route.fulfill({ json: { projects: [], suppliers: [] } });
            return;
          }
          if (emptyLists.has(url.pathname)) {
            await route.fulfill({ json: [] });
            return;
          }
        }
      }
      unexpectedRequests.push(`${request.method()} ${request.url()}`);
      await route.fulfill({ status: 501, json: { error: "Unmocked promotion test request" } });
    });

    await use({
      acceptRequests,
      load: async (requestedRole = "estimator", path = "/estimates") => {
        role = requestedRole;
        await page.addInitScript((currentRole) => {
          if (window.top !== window) return;
          Reflect.deleteProperty(Navigator.prototype, "serviceWorker");
          localStorage.clear();
          localStorage.setItem("currentRole", currentRole);
          localStorage.setItem("uiDensityMode", "comfortable");
        }, role);
        await openApp(page, path);
        await expect(page.locator("#appLoadingOverlay")).toBeHidden();
        await page.waitForLoadState("networkidle");
        if (role === "sales_manager") {
          const notice = page.locator("#managerEstimateNoticeDialog");
          await expect(notice).toBeVisible();
          await notice.locator('[data-close="managerEstimateNoticeDialog"]').first().click();
          await expect(notice).toBeHidden();
        }
      },
    });

    expect(unexpectedRequests, "Every request must be served by an explicit local mock").toEqual([]);
    expect(pageErrors, "The production bundle must boot without JavaScript errors").toEqual([]);
  },
});

// Set KONTUR_BASE_URL to a loopback URL when running to disable the config's webServer.
test.use({ baseURL: appOrigin, serviceWorkers: "block" });

test("archived and submitted estimates never count as overdue", async ({ page, offlineApp }) => {
  await offlineApp.load();
  await expect(page.locator('[data-estimate-job-filter="overdue"] strong')).toHaveText("1");
  await page.locator('[data-estimate-job-filter="overdue"]').click();
  await expect(page.locator("#estimateJobRows .estimate-job-row")).toHaveCount(1);
  await expect(page.locator('[data-estimate-job="902"]')).toHaveAttribute("data-estimate-tone", "overdue");
  await expect(page.locator('[data-estimate-job="903"], [data-estimate-job="904"]')).toHaveCount(0);

  await page.locator('[data-estimate-list-mode="archive"]').click();
  await expect(page.locator('[data-estimate-job="904"]')).toHaveAttribute("data-estimate-tone", "neutral");
  await expect(page.locator('[data-estimate-job-filter="overdue"] strong')).toHaveText("0");
  await expect(page.locator("#estimateJobSchedule .estimate-timeline-row")).toHaveCount(0);
  await page.locator('[data-estimate-job-filter="overdue"]').click();
  await expect(page.locator("#estimateJobRows .estimate-job-row")).toHaveCount(0);
});

test("switching either estimate list resets the status filter", async ({ page, offlineApp }) => {
  await offlineApp.load();
  await page.locator('[data-estimate-job-filter="active"]').click();
  await expect(page.locator("#estimateJobRows .estimate-job-row")).toHaveCount(2);
  await page.locator('[data-estimate-list-mode="archive"]').click();
  await expect(page.locator('[data-estimate-job-filter="all"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#estimateJobRows .estimate-job-row")).toHaveCount(1);
  await expect(page.locator('[data-estimate-job="904"]')).toBeVisible();

  await page.locator('[data-estimate-job-filter="overdue"]').click();
  await page.locator('[data-estimate-list-mode="active"]').click();
  await expect(page.locator('[data-estimate-job-filter="all"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#estimateJobRows .estimate-job-row")).toHaveCount(3);
  await expect(page.locator('[data-estimate-job="903"]')).toBeVisible();
  await expect(page.locator('[data-estimate-job="904"]')).toHaveCount(0);
});

test("production estimate cards remain collapsed until explicitly expanded", async ({ page, offlineApp }) => {
  await offlineApp.load();
  const card = page.locator('details.estimate-job-row[data-estimate-job="903"]');
  const body = card.locator(".estimate-job-body");
  await expect(card).toHaveCount(1);
  await expect(card).not.toHaveAttribute("open", "");
  await expect(body).toBeHidden();
  await card.locator(":scope > summary").click();
  await expect(card).toHaveAttribute("open", "");
  await expect(body).toBeVisible();
  await expect(body).toContainText("Synthetic submitted result.");
  await card.locator(":scope > summary").click();
  await expect(body).toBeHidden();
  await expect(page).toHaveURL(`${appOrigin}/estimates`);
});

test("estimate file preview stays inside Kontur and closes back to the same card", async ({ page, offlineApp }) => {
  await offlineApp.load();
  const card = page.locator('[data-estimate-job="903"]');
  await card.locator(":scope > summary").click();
  await card.locator(".estimate-files-group > summary").click();
  const preview = card.locator('[data-media-preview="text"]').first();
  await expect(preview).not.toHaveAttribute("target", "_blank");
  const initialPages = page.context().pages().length;
  await preview.click();
  await expect(page.locator("#mediaPreviewDialog")).toBeVisible();
  await expect(page.frameLocator("#mediaPreviewBody iframe").locator("body")).toContainText("Synthetic preview: promotion-current.txt");
  await expect(page.locator("#mediaPreviewCounter")).toHaveText("1 / 2");
  await page.locator("#mediaPreviewNext").click();
  await expect(page.locator("#mediaPreviewCounter")).toHaveText("2 / 2");
  await expect(page.frameLocator("#mediaPreviewBody iframe").locator("body")).toContainText("Synthetic preview: promotion-previous.txt");
  await page.locator("#mediaPreviewCloseBottom").click();
  await expect(page.locator("#mediaPreviewDialog")).toBeHidden();
  await expect(page.locator("#mediaPreviewBody")).toBeEmpty();
  await expect(card).toHaveAttribute("open", "");
  await preview.click();
  await page.locator("#mediaPreviewClose").click();
  await expect(page.locator("#mediaPreviewDialog")).toBeHidden();
  await expect(page).toHaveURL(`${appOrigin}/estimates`);
  expect(page.context().pages()).toHaveLength(initialPages);
});

test("only the current estimate file can be replaced and replacement accepts one file", async ({ page, offlineApp }) => {
  await offlineApp.load();
  const card = page.locator('[data-estimate-job="903"]');
  await card.locator(":scope > summary").click();
  await card.locator(".estimate-files-group > summary").click();
  await expect(card.locator("[data-print-estimate-file]")).toHaveCount(2);
  await expect(card.locator("[data-delete-estimate-file]")).toHaveCount(2);
  await expect(card.locator("[data-replace-estimate-file]")).toHaveCount(1);
  await expect(card.locator('[data-replace-estimate-file="9702"]')).toHaveCount(0);
  await card.locator('[data-replace-estimate-file="9701"]').click();
  const dialog = page.locator("#estimateJobFileDialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[name="mode"]')).toHaveValue("replace");
  await expect(dialog.locator('[name="replace_file_id"]')).toHaveValue("9701");
  await expect(dialog.locator('[name="replace_file_id"] option')).toHaveCount(1);
  await expect(dialog.locator('[name="attachments"]')).toHaveJSProperty("multiple", false);
  await dialog.locator('[name="mode"]').selectOption("add");
  await expect(page.locator("#estimateReplaceFileWrap")).toBeHidden();
  await expect(dialog.locator('[name="attachments"]')).toHaveJSProperty("multiple", true);
  await dialog.locator('[data-close="estimateJobFileDialog"]').first().click();
  await expect(dialog).toBeHidden();
});

test("manager notice clears the previous filter so the submitted estimate is visible", async ({ page, offlineApp }) => {
  await offlineApp.load("sales_manager");
  await page.locator('[data-estimate-job-filter="active"]').click();
  await expect(page.locator('[data-estimate-job-filter="active"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-estimate-job="903"]')).toHaveCount(0);
  await page.locator('[data-view="today"]:visible, [data-view-target="today"]:visible').first().click();
  await expect(page.locator("#todayView")).toHaveClass(/active/);
  await page.locator("#managerEstimateNoticePanel [data-open-manager-estimate-notice]").click();
  const dialog = page.locator("#managerEstimateNoticeDialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("#managerEstimateNoticeList [data-manager-estimate-open-section]").first().click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#estimatesView")).toHaveClass(/active/);
  await expect(page.locator('[data-estimate-list-mode="active"]')).toHaveClass(/active/);
  await expect(page.locator('[data-estimate-job-filter="all"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-estimate-job="903"]')).toBeVisible();
});

test("partial material acceptance rejects no selection and posts only checked item IDs", async ({ page, offlineApp }) => {
  await offlineApp.load("procurement_manager", "/materials");
  await page.locator('#materialRows [data-open-material-batch="batch-801"]').click();
  const dialog = page.locator("#materialReviewDialog");
  await expect(dialog).toBeVisible();
  const first = dialog.locator('[data-accept-material-check="8101"]');
  const second = dialog.locator('[data-accept-material-check="8102"]');
  await expect(first).toBeChecked();
  await expect(second).toBeChecked();
  await first.uncheck();
  await second.uncheck();
  await dialog.locator('[data-material-batch-action="accept"]').click();
  await expect(page.locator("#toast")).toHaveClass(/active/);
  await expect(dialog).toBeVisible();
  expect(offlineApp.acceptRequests).toHaveLength(0);

  await first.check();
  await dialog.locator("#materialBatchReturnComment").fill("Synthetic QA: defer the second item.");
  await dialog.locator('[data-material-batch-action="accept"]').click();
  await expect.poll(() => offlineApp.acceptRequests.length).toBe(1);
  expect(offlineApp.acceptRequests[0]).toMatchObject({
    accept_item_ids: [8101],
    comment: "Synthetic QA: defer the second item.",
    actor_role: "procurement_manager",
    actor_id: 103,
  });
  await expect(dialog).toBeHidden();
});
