import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { openApp } from "../helpers/auth";

// Static assets use the configured local server; all application data is synthetic.
const viewports = [
  [320, 568], [360, 640], [375, 812], [390, 844], [430, 932],
  [720, 840], [768, 1024], [832, 750], [1024, 768], [1280, 720], [1440, 900],
  [1024, 600], [1920, 1080], [3840, 2160],
];
const routes = ["/today", "/estimates", "/materials", "/tasks", "/objects", "/photo-reports"];
const forms = [
  ["/estimates", "#newEstimateJobButton", "#estimateJobDialog"],
  ["/materials", "#newMaterialButton", "#materialDialog"],
  ["/tasks", "#newTaskButton", "#taskDialog"],
  ["/photo-reports", "#newPhotoReportButton", "#photoReportDialog"],
];
const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
const files = [9501, 9502].map((id) => ({
  id, file_name: `synthetic-alignment-image-${id}.png`, title: `Synthetic image ${id}`,
  mime_type: "image/png", is_current: 1, version_no: 1,
}));
const jobs = [{
  id: 9500, title: "Synthetic estimate with a deliberately long project title and two attachments",
  project_id: 1, project_title: "Synthetic alignment project", customer_name: "Synthetic customer",
  manager_id: 2, estimator_id: 3, manager_name: "Synthetic manager", estimator_name: "Synthetic estimator",
  status: "estimate_done", received_at: "2026-09-01", due_date: "2099-12-31", delivered_at: "2026-09-10",
  result_comment: "Synthetic result for geometry and preview checks only.", files,
}];
const users = [
  { id: 1, role: "owner", name: "Synthetic owner" },
  { id: 2, role: "sales_manager", name: "Synthetic manager" },
  { id: 3, role: "estimator", name: "Synthetic estimator" },
  { id: 4, role: "construction_manager", name: "Synthetic construction manager" },
  { id: 5, role: "procurement_manager", name: "Synthetic procurement" },
  { id: 7, role: "foreman", name: "Synthetic foreman" },
];
const projects = [1, 2, 3].map((id) => ({
  id, title: `Synthetic alignment project ${id} with a long readable name`, customer_id: id,
  customer_name: `Synthetic customer ${id}`, customer_phone: "+7-000-000-00-00", customer_email: "qa@example.invalid",
  status: "in_progress", address: "Synthetic address", smetter_ref: "SYNTHETIC-QA",
  sales_manager_id: 2, construction_manager_id: 4, foreman_id: 7, estimator_id: 3, procurement_manager_id: 5,
  foreman_name: "Synthetic foreman", estimator_name: "Synthetic estimator", procurement_name: "Synthetic procurement",
  planned_end_date: "2099-12-31", main_estimate_amount: 100000, approved_variations_amount: 0, unresolved_overbudget_amount: 0,
}));
const tasks = projects.map((project) => ({
  id: 9600 + project.id, project_id: project.id, project_title: project.title,
  title: `Synthetic task ${project.id} with a long description to check the layout`,
  assignee_id: 7, assignee_name: "Synthetic foreman", assignee_role: "foreman", project_foreman_id: 7,
  creator_id: 1, reviewer_id: 1, due_date: "2020-01-01", start_date: "2020-01-01",
  status: "in_progress", status_key: "in_progress", task_type: "task", priority: "high",
  description: "Synthetic UI-only task. No state transition is performed.",
  is_execution_overdue: true, is_review_overdue: false, events: [], attachments: [],
}));
const estimateMaterials = [1, 2].map((id) => ({
  id, project_id: 1, section: "Synthetic material section", name: `Synthetic material ${id}`,
  unit: "pcs", estimated_quantity: 10, unit_price: 100, total_price: 1000,
  request_batches: 0, requested_quantity: 0, request_statuses: "",
}));
const materials = [{
  id: 9700, batch_id: 9700, project_id: 1, project_title: projects[0].title,
  title: "Synthetic request with multiple material positions", creator_id: 7, creator_name: "Synthetic foreman",
  creator_role: "foreman", project_foreman_id: 7, batch_status: "new", batch_stage: "request",
  batch_health: "normal", batch_created_at: "2026-09-01 09:00:00", needed_at: "2099-12-31",
  basis_type: "main_estimate", requested_quantity: 2, requested_unit: "pcs", estimated_quantity: 10,
  unit_price: 100, total_amount: 200, delivery_urgency: "standard",
}];
const emptyLists = new Set([
  "/api/projects/archive", "/api/object-remarks", "/api/blockers", "/api/notifications",
  "/api/variations", "/api/contracts", "/api/document-folders", "/api/documents",
  "/api/feedback", "/api/events", "/api/work-items", "/api/work-extra-items",
]);

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page, baseURL }) => {
  expect(baseURL, "The UI audit requires Playwright's configured local baseURL").toBeTruthy();
  const url = new URL(baseURL!);
  expect(url.protocol).toMatch(/^https?:$/);
  expect(url.hostname, "Remote application URLs are forbidden for synthetic UI tests").toMatch(/^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/);
  const previewPng = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#eceeea";
    context.fillRect(0, 0, 640, 480);
    context.fillStyle = "#7b0d18";
    context.fillRect(32, 32, 576, 64);
    context.fillStyle = "#365d7b";
    context.fillRect(32, 120, 280, 264);
    context.fillStyle = "#38643e";
    context.fillRect(336, 120, 272, 264);
    context.fillStyle = "#282d2f";
    context.font = "24px sans-serif";
    context.fillText("Synthetic preview 640 x 480", 32, 432);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
  await page.context().route("**/*", async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    if (target.origin !== url.origin || !["GET", "HEAD"].includes(request.method())) {
      await route.abort("blockedbyclient");
      throw new Error(`UI-only audit blocked ${request.method()} ${request.url()}`);
    }
    const fixture = new Map<string, unknown>([
      ["/api/session", { login: "synthetic", role: "owner", user_id: 1, user: users[0], can_switch_role: true }],
      ["/api/users", users], ["/api/projects", projects], ["/api/tasks", tasks],
      ["/api/estimate-materials", estimateMaterials],
      ["/api/material-requests", target.searchParams.get("archive") === "1" ? [] : materials],
      ["/api/summary", { projects: 3, tasks_open: 3, tasks_overdue: 3 }],
      ["/api/locations", { projects: [], suppliers: [] }],
      ["/api/data-integrity", { status: "ok", summary: {}, violations: [], violation_counts: {}, warning_counts_by_type: {}, material_counts: {} }],
    ]);
    const project = projects.find((item) => target.pathname === `/api/projects/${item.id}`);
    if (project) {
      fixture.set(target.pathname, {
        ...project, customer_projects_count: 1, tasks: tasks.filter((task) => task.project_id === project.id),
        materials: project.id === 1 ? materials : [], estimate_materials: project.id === 1 ? estimateMaterials : [],
        variations: [], works: [], extra_works: [], contracts: [], photo_reports: [], documents: [],
        object_remarks: [], blockers: [], events: [], timeline: [],
      });
    }
    const task = tasks.find((item) => target.pathname === `/api/tasks/${item.id}`);
    if (task) fixture.set(target.pathname, task);
    if (fixture.has(target.pathname) || emptyLists.has(target.pathname)) {
      await route.fulfill({ json: fixture.get(target.pathname) ?? [] });
      return;
    }
    // Exercise the real renderers and dialogs without uploading or changing records.
    if (target.pathname === "/api/estimate-jobs") {
      await route.fulfill({ json: jobs });
      return;
    }
    if (target.pathname === "/api/photo-reports") {
      await route.fulfill({ json: [{
        id: 9500, project_id: 1, project_title: "Synthetic photo report with a long object name",
        author_name: "Synthetic author", report_date: "2026-09-10", status: "review",
        stage: "Synthetic stage with a long readable description", zones: "Synthetic inspection area",
        comment: "Local synthetic preview fixture, no upload or business data.", attachments: files,
      }] });
      return;
    }
    if (/^\/api\/(documents|estimate-job-files)\/950[12]\/download$/.test(target.pathname)) {
      await route.fulfill({ contentType: "image/png", body: previewPng });
      return;
    }
    if (target.pathname.startsWith("/api/")) {
      await route.abort("blockedbyclient");
      throw new Error(`Missing synthetic UI fixture: ${target.pathname}`);
    }
    await route.continue();
  });
  await page.addInitScript(() => {
    localStorage.setItem("currentRole", "owner");
    Reflect.deleteProperty(Navigator.prototype, "serviceWorker");
  });
});

async function geometry(page: Page, selector: string) {
  return page.locator(selector).evaluate((root) => {
    const visible = (node: Element) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && node.checkVisibility() && getComputedStyle(node).visibility !== "hidden";
    };
    const id = (node: Element) => `${node.tagName.toLowerCase()}#${node.id}.${String(node.className).replace(/\s+/g, ".")}[${node.getAttribute("name") || ""}]`;
    const controls = [...root.querySelectorAll<HTMLElement>("input:not([type=hidden]),select,textarea,button")].filter(visible);
    const clipped = controls.filter((node) => {
      // These two established strips intentionally scroll. Their reachability is tested separately.
      if (node.parentElement!.matches(".tabs,#estimateJobStats .task-stats")) return false;
      const box = node.getBoundingClientRect();
      const parent = node.parentElement!.getBoundingClientRect();
      return box.left < parent.left - 1 || box.right > parent.right + 1;
    }).map(id);
    const clippedButtons = [...root.querySelectorAll<HTMLElement>("button,.primary,.secondary,.link-button")].filter(visible).filter((node) => {
      if (!node.textContent?.trim()) return false;
      const range = document.createRange();
      range.selectNodeContents(node);
      const text = range.getBoundingClientRect();
      const box = node.getBoundingClientRect();
      return text.left < box.left - 1 || text.right > box.right + 1 || text.top < box.top - 1 || text.bottom > box.bottom + 1;
    }).map(id);
    const pairs = [...root.querySelectorAll<HTMLElement>(".grid-2")].filter(visible).flatMap((grid) => {
      const fields = [...grid.querySelectorAll<HTMLElement>(":scope > label > input,:scope > label > select")].filter(visible);
      if (fields.length !== 2) return [];
      const [a, b] = fields.map((node) => node.getBoundingClientRect());
      if (Math.abs(a.left - b.left) < 2) return [];
      return [{ fields: fields.map(id), topDelta: Math.abs(a.top - b.top), heightDelta: Math.abs(a.height - b.height) }];
    });
    const bounds = root.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      bounds: { left: bounds.left, right: bounds.right, width: bounds.width },
      pageOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      rootOverflow: root.scrollWidth - root.clientWidth,
      clipped,
      clippedButtons,
      pairs,
      smallFields: controls.filter((node) => node.matches("input:not([type=checkbox]):not([type=radio]),select,textarea") && node.getBoundingClientRect().height < 43.99).map(id),
      offscreenObjectSwitches: [...root.querySelectorAll<HTMLElement>(".project-list-tools button")].filter(visible).filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left < 0 || rect.right > innerWidth;
      }).map(id),
      narrowEstimateBodies: [...root.querySelectorAll<HTMLElement>(".estimate-job-body > .estimate-job-main")].filter(visible).filter((node) => {
        const available = node.parentElement!.getBoundingClientRect().width;
        return node.getBoundingClientRect().width < Math.min(280, available * (innerWidth <= 1100 ? 0.95 : 0.5));
      }).map(id),
    };
  });
}

async function record(page: Page, info: TestInfo, name: string, selector = ".view.active") {
  await page.evaluate(() => document.fonts.ready);
  const result = await geometry(page, selector);
  const path = info.outputPath(`${name}-geometry.json`);
  await writeFile(path, JSON.stringify(result, null, 2));
  await info.attach(`${name}-geometry`, { path, contentType: "application/json" });
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: !selector.startsWith("#") });
  expect.soft(result.pageOverflow, `${name}: page overflow`).toBeLessThanOrEqual(1);
  expect.soft(result.rootOverflow, `${name}: root overflow`).toBeLessThanOrEqual(1);
  expect.soft(result.clipped, `${name}: controls leave their parent`).toEqual([]);
  expect.soft(result.clippedButtons, `${name}: button content clipped`).toEqual([]);
  expect.soft(result.offscreenObjectSwitches, `${name}: object switch leaves the viewport`).toEqual([]);
  expect.soft(result.narrowEstimateBodies, `${name}: actions squeeze the estimate content`).toEqual([]);
  for (const pair of result.pairs) {
    expect.soft(pair.topDelta, `${name}: ${pair.fields.join(" / ")} top alignment`).toBeLessThanOrEqual(1);
    expect.soft(pair.heightDelta, `${name}: paired field height`).toBeLessThanOrEqual(1);
  }
  if (selector.endsWith("Dialog") && result.viewport.width <= 1100) {
    expect.soft(result.smallFields, `${name}: touch fields below 44px`).toEqual([]);
  }
}

async function checkScrollableStrip(page: Page, selector: string) {
  const strip = page.locator(selector);
  const last = strip.locator("button").last();
  await last.scrollIntoViewIfNeeded();
  const position = await last.boundingBox();
  expect(position!.x).toBeGreaterThanOrEqual(0);
  expect(position!.x + position!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await strip.evaluate((node) => { node.scrollLeft = 0; });
}

for (const [width, height] of viewports) {
  test(`real screens and form alignment at ${width}x${height}`, async ({ page, baseURL }, info) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize({ width, height });
    for (const route of routes) {
      await openApp(page, route);
      await expect(page.locator("#appLoadingOverlay")).toBeHidden();
      await record(page, info, route.slice(1));
      if (route === "/today") {
        const toggle = page.locator("[data-toggle-today-project]").first();
        await toggle.click();
        await record(page, info, "today-expanded");
        await toggle.click();
      }
      if (route === "/tasks") {
        await page.locator("#taskProjectRows [data-task-project]").first().click();
        const task = page.locator("#taskRows .task-collapsible").first();
        await task.locator(":scope > summary").click();
        await record(page, info, "task-expanded");
      }
      if (route === "/objects") {
        await page.locator("#projectRows [data-open-project]").first().click();
        await expect(page.locator("#projectDetail")).toBeVisible();
        await record(page, info, "object-detail");
        await checkScrollableStrip(page, "#projectDetail .tabs");
        await page.locator("#projectDetail [data-edit-project]").click();
        await record(page, info, "object-form", "#projectDialog");
        await page.locator("#projectDialog .form-actions").scrollIntoViewIfNeeded();
        await record(page, info, "object-form-bottom", "#projectDialog");
        await page.locator('#projectDialog [data-close="projectDialog"]').last().click();
      }
      if (route === "/estimates") {
        await checkScrollableStrip(page, "#estimateJobStats .task-stats");
        const card = page.locator('[data-estimate-job="9500"]');
        await card.locator(":scope > summary").click();
        await card.locator(".estimate-files-group > summary").click();
        await record(page, info, "estimate-expanded");
        await card.locator("[data-replace-estimate-file]").first().click();
        await record(page, info, "estimate-files-form", "#estimateJobFileDialog");
        await page.locator('#estimateJobFileDialog input[type="file"]').setInputFiles({
          name: "synthetic-replacement.png", mimeType: "image/png", buffer: tinyPng,
        });
        await page.locator("#estimateJobFileDialog .form-actions").scrollIntoViewIfNeeded();
        await record(page, info, "estimate-files-selected", "#estimateJobFileDialog");
        await page.locator('#estimateJobFileDialog [data-close="estimateJobFileDialog"]').last().click();
      }
      if (route === "/photo-reports") {
        const thumb = page.locator("#photoReportRows .media-thumb").first();
        await expect(thumb).toBeVisible();
        expect((await thumb.boundingBox())!.width).toBeGreaterThanOrEqual(width <= 1100 ? 120 : 80);
        await thumb.click();
        await expect(page.locator("#mediaPreviewDialog")).toBeVisible();
        await expect(page.locator("#mediaPreviewBody img")).toBeVisible();
        await expect(page.locator("#mediaPreviewBody img")).toHaveJSProperty("naturalWidth", 640);
        const originalLink = page.locator("#mediaPreviewOpenOriginal");
        await expect(originalLink).toBeVisible();
        const originalLinkTextCenter = await originalLink.evaluate(async (node) => {
          await document.fonts.ready;
          const range = document.createRange();
          range.selectNodeContents(node);
          const text = range.getBoundingClientRect();
          const box = node.getBoundingClientRect();
          return {
            x: Math.abs((text.left + text.right) / 2 - (box.left + box.right) / 2),
            y: Math.abs((text.top + text.bottom) / 2 - (box.top + box.bottom) / 2),
          };
        });
        expect.soft(Math.max(originalLinkTextCenter.x, originalLinkTextCenter.y), `${width}px: preview original-link text centered on both axes`).toBeLessThanOrEqual(2);
        await record(page, info, "photo-preview", "#mediaPreviewDialog");
        await page.locator("#mediaPreviewNext").click();
        await expect(page.locator("#mediaPreviewCounter")).toHaveText("2 / 2");
        await page.locator("#mediaPreviewPrev").click();
        await expect(page.locator("#mediaPreviewCounter")).toHaveText("1 / 2");
        await page.locator("#mediaPreviewCloseBottom").click();
        await expect(page.locator("#mediaPreviewDialog")).toBeHidden();
        await expect(page).toHaveURL(new URL("/photo-reports", baseURL).href);
      }
    }
    for (const [route, button, dialog] of forms) {
      await openApp(page, route);
      await page.locator(button).click();
      await expect(page.locator(dialog)).toBeVisible();
      if (dialog === "#materialDialog") {
        await page.locator("#materialEstimatePicker summary").first().click();
        await page.locator("#addExtraMaterialButton").click();
      }
      await record(page, info, `${route.slice(1)}-form`, dialog);
      const actions = page.locator(`${dialog} > .form > .form-actions`).last();
      await actions.scrollIntoViewIfNeeded();
      await record(page, info, `${route.slice(1)}-form-bottom`, dialog);
      await page.locator(`${dialog} [data-close]`).last().click();
      await expect(page.locator(dialog)).toBeHidden();
    }
    expect(errors).toEqual([]);
  });
}

test("object switches stay on screen and usable through the continuous width sweep", async ({ page }, info) => {
  test.setTimeout(180_000);
  await openApp(page, "/objects");
  const widths = new Set([719, 720, 721, 767, 768, 769, 819, 820, 821, 832, 1024, 1099, 1100, 1101, 1180, 1181, 1220, 1221, 1380, 1381, 1440, 2560, 3440, 3840]);
  for (let width = 320; width <= 1920; width += 16) widths.add(width);
  const failures: unknown[] = [];
  for (const width of [...widths].sort((a, b) => a - b)) {
    await page.setViewportSize({ width, height: 900 });
    const result = await geometry(page, "#projectsView");
    if (result.pageOverflow > 1 || result.clipped.length || result.offscreenObjectSwitches.length || result.clippedButtons.length) {
      failures.push(result);
      await page.screenshot({ path: info.outputPath(`objects-sweep-${width}.png`) });
    }
  }
  const path = info.outputPath("sweep.json");
  await writeFile(path, JSON.stringify({ widths: [...widths].sort((a, b) => a - b), failures }, null, 2));
  await info.attach("sweep", { path, contentType: "application/json" });
  expect(failures, "Every tested width must keep the card grids and all four switches in bounds").toEqual([]);
  for (const width of [320, 721, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('[data-project-list="archive"]').click();
    await expect(page.locator('[data-project-list="archive"]')).toHaveClass(/active/);
    await page.locator('[data-project-list="active"]').click();
    await expect(page.locator("#projectRows [data-open-project]").first()).toBeVisible();
    await page.locator('[data-project-display="cards"]').click();
    await expect(page.locator("#projectRows")).toHaveClass(/project-card-mode/);
    await page.locator('[data-project-display="table"]').click();
    await expect(page.locator("#projectRows")).toHaveClass(/project-table-mode/);
  }
});

test("operational views reflow from phone to ultrawide without a reload", async ({ page }, info) => {
  test.setTimeout(180_000);
  const widths = Array.from({ length: 101 }, (_, index) => 320 + index * 16);
  widths.push(2560, 3440, 3840);
  const failures: unknown[] = [];
  for (const route of routes) {
    await openApp(page, route);
    await page.evaluate(() => document.fonts.ready);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const result = await geometry(page, ".view.active");
      if (result.pageOverflow > 1 || result.rootOverflow > 1 || result.clipped.length || result.clippedButtons.length || result.offscreenObjectSwitches.length) {
        failures.push({ route, ...result });
      }
    }
  }
  const path = info.outputPath("operational-sweep.json");
  await writeFile(path, JSON.stringify({ widths, routes, failures }, null, 2));
  await info.attach("operational-sweep", { path, contentType: "application/json" });
  expect(failures).toEqual([]);
});

test("wheel scrolling exposes the last content above mobile navigation", async ({ page }, info) => {
  test.setTimeout(90_000);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      await openApp(page, route);
      await page.evaluate(() => window.scrollTo(0, 0));
      const start = await page.evaluate(() => window.scrollY);
      await page.mouse.move(width / 2, 420);
      await page.mouse.wheel(0, 20000);
      await expect.poll(() => page.evaluate(() => {
        const view = document.querySelector(".view.active")!.getBoundingClientRect();
        const nav = document.querySelector(".mobile-bottom-nav")!.getBoundingClientRect();
        return view.bottom <= nav.top + 1;
      })).toBe(true);
      if (route === "/today") expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(start);
      await page.screenshot({ path: info.outputPath(`${route.slice(1)}-last-${width}.png`) });
    }
  }
});
