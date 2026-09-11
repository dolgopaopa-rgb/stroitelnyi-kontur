import { expect, test, type Locator, type Page } from "@playwright/test";
import { openApp } from "../helpers/auth";

test.use({ serviceWorkers: "block" });

const now = new Date("2026-09-11T09:00:00.000Z");
const users = [
  { id: 1, role: "owner", name: "QA Owner" },
  { id: 2, role: "sales_manager", name: "QA Manager" },
  { id: 3, role: "estimator", name: "QA Estimator" },
  { id: 4, role: "construction_manager", name: "QA Construction" },
  { id: 5, role: "procurement_manager", name: "QA Procurement" },
  { id: 7, role: "foreman", name: "QA Foreman" },
];
const projects = [1, 2, 3].map((id) => ({
  id, title: `QA Object ${id}`, customer_id: id, customer_name: `QA Customer ${id}`,
  customer_phone: "+7-000-000-00-00", customer_email: "qa@example.invalid",
  status: "in_progress", address: `QA Address ${id}`, smetter_ref: "SYNTHETIC-QA",
  sales_manager_id: 2, construction_manager_id: 4, estimator_id: 3,
  procurement_manager_id: 5, foreman_id: 7, foreman_name: "QA Foreman",
  planned_end_date: "2099-12-31", main_estimate_amount: 100000,
  approved_variations_amount: 0, unresolved_overbudget_amount: 0,
}));
const tasks = projects.map((project) => ({
  id: 9600 + project.id, project_id: project.id, project_title: project.title,
  title: `QA Task ${project.id}`, description: "Synthetic compact panel regression.",
  assignee_id: 7, assignee_name: "QA Foreman", assignee_role: "foreman", project_foreman_id: 7,
  creator_id: 1, creator_name: "QA Owner", reviewer_id: 1, reviewer_name: "QA Owner",
  due_date: "2099-12-31", status: "in_progress", status_key: "in_progress",
  task_type: "task", priority: "normal", is_execution_overdue: false, is_review_overdue: false,
  events: [], attachments: [],
}));
const materials = projects.map((project) => ({
  id: 9700 + project.id, batch_id: 9700 + project.id, project_id: project.id,
  project_title: project.title, title: `QA Material ${project.id}`, creator_id: 7,
  creator_name: "QA Foreman", creator_role: "foreman", project_foreman_id: 7,
  batch_status: "new", batch_stage: "request", batch_health: "problem",
  batch_created_at: now.toISOString(), needed_at: "2099-12-31",
  basis_type: "main_estimate", requested_quantity: 2, requested_unit: "pcs",
  estimated_quantity: 10, unit_price: 100, total_amount: 200, delivery_urgency: "standard",
}));
const notifications = [1, 2, 3, 4].map((id) => ({
  id: 9800 + id, project_id: id % 2 ? 1 : 2, project_title: `QA Object ${id % 2 ? 1 : 2}`,
  title: `QA Comment ${id}`, text: `Synthetic comment ${id}`, related_type: "task",
  related_id: id % 2 ? 9601 : 9602, is_read: false,
  created_at: new Date(now.getTime() - id * 60000).toISOString(),
}));
notifications.push({ ...notifications[2], id: 9805 });

const emptyLists = [
  "/api/projects/archive", "/api/estimate-jobs", "/api/estimate-materials",
  "/api/photo-reports", "/api/object-remarks", "/api/blockers", "/api/variations",
  "/api/contracts", "/api/document-folders", "/api/documents", "/api/feedback",
  "/api/events", "/api/work-items", "/api/work-extra-items",
];
const observations = new WeakMap<Page, { blocked: string[]; errors: string[] }>();

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL) throw new Error("A configured loopback QA baseURL is required.");
  const local = new URL(baseURL);
  expect(local.protocol).toMatch(/^https?:$/);
  expect(local.hostname, "Remote servers are forbidden").toMatch(/^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/);
  const observed = { blocked: [] as string[], errors: [] as string[] };
  observations.set(page, observed);
  page.on("pageerror", (error) => observed.errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") observed.errors.push(message.text()); });

  // Follow the existing synthetic UI audit fixtures; no application API reaches the server.
  const fixtures = new Map<string, unknown>(emptyLists.map((path) => [path, []]));
  fixtures.set("/api/session", { login: "synthetic", role: "owner", user_id: 1, user: users[0], can_switch_role: true });
  fixtures.set("/api/users", users);
  fixtures.set("/api/projects", projects);
  fixtures.set("/api/tasks", tasks);
  fixtures.set("/api/notifications", notifications);
  fixtures.set("/api/summary", { projects: 3, pending_handover: 1, construction_review: 1, tasks_open: 3, tasks_overdue: 0 });
  fixtures.set("/api/locations", { projects, suppliers: [{ id: 9901, title: "QA Supplier", address: "QA Depot" }] });
  fixtures.set("/api/data-integrity", { status: "ok", summary: {}, violations: [], violation_counts: {}, warning_counts_by_type: {}, material_counts: {} });
  for (const project of projects) {
    fixtures.set(`/api/projects/${project.id}`, {
      ...project, customer_projects_count: 1,
      tasks: tasks.filter((task) => task.project_id === project.id),
      materials: materials.filter((item) => item.project_id === project.id),
      estimate_materials: [], variations: [], works: [], extra_works: [], contracts: [],
      photo_reports: [], documents: [], object_remarks: [], blockers: [], events: [], timeline: [],
    });
  }
  for (const task of tasks) fixtures.set(`/api/tasks/${task.id}`, task);
  await page.context().route("**/*", async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    if (target.origin !== local.origin || !["GET", "HEAD"].includes(request.method())) {
      observed.blocked.push(`${request.method()} ${target.pathname}`);
      await route.abort("blockedbyclient");
    } else if (target.pathname === "/api/material-requests") {
      await route.fulfill({ json: target.searchParams.get("archive") === "1" ? [] : materials });
    } else if (fixtures.has(target.pathname)) {
      await route.fulfill({ json: fixtures.get(target.pathname) });
    } else if (target.pathname.startsWith("/api/") || target.pathname === "/login") {
      observed.blocked.push(`Unmocked application request: ${target.pathname}`);
      await route.abort("blockedbyclient");
    } else if (request.resourceType() === "document" || target.pathname.startsWith("/static/") || target.pathname === "/favicon.ico") {
      await route.continue();
    } else {
      observed.blocked.push(`Unexpected local resource: ${target.pathname}`);
      await route.abort("blockedbyclient");
    }
  });
  await page.clock.setFixedTime(now);
  await page.addInitScript(() => {
    localStorage.setItem("currentRole", "owner");
    Reflect.deleteProperty(Navigator.prototype, "serviceWorker");
  });
});

test.afterEach(async ({ page }) => {
  const observed = observations.get(page);
  expect.soft(observed?.blocked, "No remote requests, backend mutations or unmocked API reads").toEqual([]);
  expect.soft(observed?.errors, "No browser errors").toEqual([]);
});

async function load(page: Page, route: string) {
  await openApp(page, route);
  await expect(page.locator("#appLoadingOverlay")).toBeHidden();
  await page.evaluate(() => document.fonts.ready);
}

async function refresh(page: Page, replaced: Locator) {
  const previous = await replaced.elementHandle();
  expect(previous, "A populated node must exist before refresh").not.toBeNull();
  // The shared refresh command is hidden in the mobile shell, but its real handler is retained.
  await page.locator("#refreshButton").evaluate((button: HTMLButtonElement) => button.click());
  await expect.poll(() => previous!.evaluate((node) => node.isConnected), { message: "Refresh actually replaced the tested DOM" }).toBe(false);
  await expect(page.locator("#appLoadingOverlay")).toBeHidden();
  await previous!.dispose();
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(1);
}

async function expectPreview(list: Locator, row: string, total: number, key: string) {
  await expect(list.locator(`:scope > ${row}`)).toHaveCount(2);
  await expect(list.locator(row)).toHaveCount(total);
  await expect(list.locator(`${row}:visible`)).toHaveCount(2);
  const disclosure = list.locator(`:scope > details.today-list-disclosure[data-collapsible-key="${key}"]`);
  await expect(disclosure).toHaveCount(1);
  await expect(disclosure).toHaveJSProperty("open", false);
  await expect(disclosure.locator(":scope > summary")).toContainText(`Показать ещё ${total - 2}`);
  await expect(disclosure.locator(row).last()).toBeHidden();
  return disclosure;
}

async function toggle(disclosure: Locator, open: boolean, keyboard = false) {
  const summary = disclosure.locator(":scope > summary");
  if (keyboard) {
    await summary.focus();
    await summary.press("Enter");
  } else await summary.click();
  await expect(disclosure).toHaveJSProperty("open", open);
  await expect(summary.locator(open ? ".disclosure-open" : ".disclosure-closed")).toBeVisible();
  await expect(summary.locator(open ? ".disclosure-closed" : ".disclosure-open")).toBeHidden();
}

async function expectEqualPanels(panels: Locator, count: number) {
  await expect(panels).toHaveCount(count);
  const boxes = await panels.evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height };
  }));
  for (const [index, box] of boxes.entries()) {
    expect(box.width).toBeGreaterThan(250);
    expect(Math.abs(box.top - boxes[0].top), "Panels start on the same row").toBeLessThanOrEqual(1);
    expect(Math.abs(box.height - boxes[0].height), "Grid stretches panels to equal height").toBeLessThanOrEqual(1);
    if (index) expect(box.left - boxes[index - 1].right, "Adjacent panels do not overlap").toBeGreaterThanOrEqual(6);
  }
  return boxes;
}

test("Today director comments and materials preview two and retain native disclosure state", async ({ page }, info) => {
  await load(page, "/today");
  await expect(page.locator("#todayView")).toHaveAttribute("data-role", "owner");
  const cases = [
    { selector: "#todayComments", total: 5, key: "today-owner-comments" },
    { selector: "#todayMaterials", total: 3, key: "today-owner-materials" },
  ];
  const panels = page.locator("#todayView .today-materials-panel, #todayView .today-comments-panel");
  if (info.project.name === "desktop-chrome") await expectEqualPanels(panels, 2);
  for (const item of cases) {
    const list = page.locator(item.selector);
    const disclosure = await expectPreview(list, ".row", item.total, item.key);
    const original = await list.locator(".row").allTextContents();
    await toggle(disclosure, true, true);
    await expect(list.locator(".row:visible")).toHaveCount(item.total);
    if (info.project.name === "desktop-chrome") await expectEqualPanels(panels, 2);
    await refresh(page, disclosure);
    await expect(disclosure).toHaveJSProperty("open", true);
    await expect(list.locator(".row:visible")).toHaveCount(item.total);
    expect(await list.locator(".row").allTextContents()).toEqual(original);
    await toggle(disclosure, false);
    await refresh(page, disclosure);
    await expectPreview(list, ".row", item.total, item.key);
    expect(await list.locator(".row").allTextContents()).toEqual(original);
    await expect(page.locator("#todayView")).toHaveClass(/active/);
  }
  await expectNoOverflow(page);
});

test("Signals sparse metrics fill width and three preview panels stretch equally", async ({ page }, info) => {
  await load(page, "/signals");
  const metrics = page.locator("#summaryCards .metric");
  await expect(metrics).toHaveCount(3);
  const grid = await page.locator("#summaryCards").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const items = [...node.querySelectorAll(".metric")].map((item) => {
      const box = item.getBoundingClientRect();
      return { x: box.left, right: box.right, y: box.top, width: box.width, height: box.height };
    });
    return {
      left: rect.left + node.clientLeft + parseFloat(style.paddingLeft),
      right: rect.left + node.clientLeft + node.clientWidth - parseFloat(style.paddingRight),
      items,
    };
  });
  const firstRow = grid.items.filter((box) => Math.abs(box.y - grid.items[0].y) <= 1);
  expect(Math.abs(firstRow[0].x - grid.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(firstRow.at(-1)!.right - grid.right), "Metrics fill the row, including sparse desktop states").toBeLessThanOrEqual(1);
  for (const box of grid.items) {
    expect(Math.abs(box.width - grid.items[0].width)).toBeLessThanOrEqual(1);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeLessThanOrEqual(64);
    expect(box.x).toBeGreaterThanOrEqual(grid.left - 1);
    expect(box.right).toBeLessThanOrEqual(grid.right + 1);
  }
  if (info.project.name === "desktop-chrome") {
    expect(firstRow).toHaveLength(3);
    const boxes = await expectEqualPanels(page.locator("#dashboardView .dashboard-preview-panel"), 3);
    for (const box of boxes) expect(Math.abs(box.width - boxes[0].width)).toBeLessThanOrEqual(1);
  }
  await expectNoOverflow(page);
});

test("Signals projects and tasks expand inline and preserve collapsed and expanded state", async ({ page }, info) => {
  await load(page, "/signals");
  for (const [selector, key] of [["#dashboardProjects", "signals-projects"], ["#dashboardTasks", "signals-tasks"]]) {
    const list = page.locator(selector);
    const disclosure = await expectPreview(list, ".row", 3, key);
    const original = await list.locator(".row").allTextContents();
    await toggle(disclosure, true, true);
    await expect(list.locator(".row:visible")).toHaveCount(3);
    if (info.project.name === "desktop-chrome") await expectEqualPanels(page.locator("#dashboardView .dashboard-preview-panel"), 3);
    await refresh(page, disclosure);
    await expect(disclosure).toHaveJSProperty("open", true);
    expect(await list.locator(".row").allTextContents()).toEqual(original);
    await toggle(disclosure, false);
    await refresh(page, disclosure);
    await expectPreview(list, ".row", 3, key);
    await expect(page.locator("#dashboardView")).toHaveClass(/active/);
  }
  await expectNoOverflow(page);
});

test("Signals notifications retain two top-level previews and nested group details", async ({ page }, info) => {
  await load(page, "/signals");
  const list = page.locator("#notificationRows");
  const disclosure = list.locator(":scope > details.today-list-disclosure.notification-collapsible");
  const preview = list.locator(":scope > .signal-row");
  await expect(preview).toHaveCount(2);
  await expect(list.locator(".signal-row")).toHaveCount(4);
  await expect(list.locator(".signal-row:visible")).toHaveCount(2);
  await expect(disclosure).toHaveJSProperty("open", false);
  await expect(disclosure.locator(":scope > summary .disclosure-closed")).toHaveText("Показать ещё 2");
  const original = await list.locator(".signal-row").allTextContents();
  const groups = disclosure.locator("details.notification-group[data-notification-group]");
  await expect(groups).toHaveCount(2);
  await toggle(disclosure, true, true);
  const first = groups.nth(0);
  const second = groups.nth(1);
  await expect(first).toHaveJSProperty("open", true);
  await expect(second).toHaveJSProperty("open", false);
  await first.locator(":scope > summary").click();
  await second.locator(":scope > summary").click();
  await expect(first).toHaveJSProperty("open", false);
  await expect(second).toHaveJSProperty("open", true);
  await expect(second.locator(".signal-row")).toBeVisible();
  await toggle(disclosure, false);
  await expect(list.locator(".signal-row:visible")).toHaveCount(2);
  await refresh(page, disclosure);
  await expect(disclosure).toHaveJSProperty("open", false);
  await toggle(disclosure, true);
  await expect(first).toHaveJSProperty("open", false);
  await expect(second).toHaveJSProperty("open", true);
  await refresh(page, disclosure);
  await expect(disclosure).toHaveJSProperty("open", true);
  await expect(first).toHaveJSProperty("open", false);
  await expect(second).toHaveJSProperty("open", true);
  await first.locator(":scope > summary").click();
  await expect(list.locator(".signal-row:visible")).toHaveCount(4);
  if (info.project.name === "desktop-chrome") await expectEqualPanels(page.locator("#dashboardView .dashboard-preview-panel"), 3);
  expect(await list.locator(".signal-row").allTextContents()).toEqual(original);
  await expect(preview).toHaveCount(2);
  await expectNoOverflow(page);
});

async function expectCompactTasks(page: Page) {
  const cards = page.locator("#taskProjectRows .task-project-row:visible, #taskRows .task-summary:visible");
  const sizes = await cards.evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    const children = [...node.children].map((child) => child.getBoundingClientRect()).filter((rect) => rect.height > 0);
    const contentHeight = Math.max(...children.map((rect) => rect.bottom)) - Math.min(...children.map((rect) => rect.top));
    return {
      minHeight: parseFloat(style.minHeight), height: box.height,
      contentBudget: contentHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth),
      overflow: node.scrollWidth - node.clientWidth,
    };
  }));
  expect(sizes.length).toBeGreaterThanOrEqual(3);
  for (const size of sizes) {
    expect(size.minHeight, "Task selectors and closed summaries use the 80px minimum, not 114px").toBe(80);
    expect(size.height).toBeGreaterThanOrEqual(80);
    expect(size.height, "Cards grow only with their content").toBeLessThanOrEqual(Math.max(80, size.contentBudget) + 1);
    expect(size.overflow).toBeLessThanOrEqual(1);
  }
  const gaps = await page.locator("#taskProjectRows .task-project-row:visible").evaluateAll((nodes) => nodes.map((node) => {
    const title = node.querySelector(".stack-line")!.getBoundingClientRect();
    const meta = node.querySelector(".task-project-indicators")!.getBoundingClientRect();
    return meta.top - title.bottom;
  }));
  for (const gap of gaps) {
    expect(gap, "Object heading is separated from task indicators").toBeGreaterThanOrEqual(8);
    expect(gap, "Heading gap remains compact").toBeLessThanOrEqual(20);
  }
}

test("Tasks show two object selectors and third-object selection survives collapse and refresh", async ({ page }) => {
  await load(page, "/tasks");
  const list = page.locator("#taskProjectRows");
  const disclosure = await expectPreview(list, ".task-project-row", 3, "tasks-owner-projects");
  await expectCompactTasks(page);
  await toggle(disclosure, true, true);
  const third = list.locator('[data-task-project="3"]');
  await third.click();
  await expect(third).toHaveClass(/active/);
  await expect(disclosure).toHaveJSProperty("open", true);
  await expect(page.locator("#taskRows [data-testid='task-card']")).toHaveCount(1);
  await expect(page.locator("#taskRows")).toContainText("QA Task 3");
  await expectCompactTasks(page);
  await toggle(disclosure, false);
  await expect(third).toBeHidden();
  await expect(page.locator("#taskRows")).toContainText("QA Task 3");
  await refresh(page, disclosure);
  await expectPreview(list, ".task-project-row", 3, "tasks-owner-projects");
  await expect(page.locator("#taskRows")).toContainText("QA Task 3");
  await expect(third).toHaveClass(/active/);
  await toggle(disclosure, true);
  await expect(third).toBeVisible();
  await expect(third).toHaveClass(/active/);
  const task = page.locator("#taskRows [data-testid='task-card']");
  await expect(task).toHaveJSProperty("open", false);
  await task.locator(":scope > summary").click();
  await expect(task).toHaveJSProperty("open", true);
  await refresh(page, disclosure);
  await expect(disclosure).toHaveJSProperty("open", true);
  await expect(task).toHaveJSProperty("open", true);
  await expect(third).toHaveClass(/active/);
  await task.locator(":scope > summary").click();
  await expectCompactTasks(page);
  await expectNoOverflow(page);
});

test("Changing the topbar selection reveals a previously collapsed third task object", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await load(page, "/tasks");
  const disclosure = page.locator("#taskProjectRows > details");
  await toggle(disclosure, true);
  await toggle(disclosure, false);
  await page.locator("#topbarProjectSelect").selectOption("3");
  await expect(page.locator("#projectsView")).toHaveClass(/active/);
  await page.locator('.nav-button[data-view="tasks"]').click();
  await expect(page.locator("#tasksView")).toHaveClass(/active/);
  await expect(disclosure).toHaveJSProperty("open", true);
  await expect(page.locator('[data-task-project="3"]')).toBeVisible();
  await expect(page.locator('[data-task-project="3"]')).toHaveClass(/active/);
  await expect(page.locator("#taskRows")).toContainText("QA Task 3");
  await refresh(page, disclosure);
  await expect(disclosure).toHaveJSProperty("open", true);
});

test("Selected object panels keep header controls readable at desktop breakpoints", async ({ page }) => {
  for (const width of [1101, 1180, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await load(page, "/objects");
    await page.locator('#projectRows [data-open-project="1"]').click();
    await expect(page.locator("#projectDetail")).toContainText("QA Object 1");
    const controls = await page.locator(".project-list-tools .segment").evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(node);
      const text = range.getBoundingClientRect();
      return { width: box.width, height: box.height, textHeight: text.height, left: text.left - box.left, right: box.right - text.right };
    }));
    for (const control of controls) {
      expect(control.width).toBeGreaterThanOrEqual(100);
      expect(control.height).toBeGreaterThanOrEqual(44);
      expect(control.textHeight).toBeLessThan(24);
      expect(control.left).toBeGreaterThanOrEqual(0);
      expect(control.right).toBeGreaterThanOrEqual(0);
    }
    await expectNoOverflow(page);
  }
});

test("Selected object status and estimate badges do not overlap the foreman", async ({ page }) => {
  for (const width of [981, 1024, 1180, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await load(page, "/objects");
    await page.locator('#projectRows [data-open-project="1"]').click();
    const rows = await page.locator("#projectRows .project-list-card").evaluateAll((nodes) => nodes.map((node) => {
      const badges = node.querySelector(".project-card-badges")!.getBoundingClientRect();
      const meta = node.querySelector(".project-meta-line")!.getBoundingClientRect();
      return {
        separated: badges.right <= meta.left || meta.right <= badges.left || badges.bottom <= meta.top || meta.bottom <= badges.top,
        pillsContained: [...node.querySelectorAll(".pill")].every((pill) => {
          const box = pill.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(pill);
          const text = range.getBoundingClientRect();
          return text.left >= box.left - 1 && text.right <= box.right + 1 && text.bottom <= box.bottom + 1;
        }),
      };
    }));
    for (const row of rows) {
      expect(row.separated).toBe(true);
      expect(row.pillsContained).toBe(true);
    }
    await expectNoOverflow(page);
  }
});

test("Locations show two objects and retain expanded and collapsed state", async ({ page }) => {
  await load(page, "/locations");
  const list = page.locator("#objectLocationRows");
  const disclosure = await expectPreview(list, ".location-row", 3, "locations-projects");
  const original = await list.locator(".location-row").allTextContents();
  await toggle(disclosure, true, true);
  await expect(list.locator(".location-row:visible")).toHaveCount(3);
  await expect(list.locator(".location-row").last()).toContainText("QA Address 3");
  await refresh(page, disclosure);
  await expect(disclosure).toHaveJSProperty("open", true);
  expect(await list.locator(".location-row").allTextContents()).toEqual(original);
  await toggle(disclosure, false);
  await refresh(page, disclosure);
  await expectPreview(list, ".location-row", 3, "locations-projects");
  await expect(page.locator("#supplierLocationForm")).toBeVisible();
  await expect(page.locator("#locationsView")).toHaveClass(/active/);
  await expectNoOverflow(page);
});

test("Objects header controls stay compact, contained and functional", async ({ page }, info) => {
  await load(page, "/objects");
  const controls = page.locator("#projectsView .project-list-tools .segment");
  await expect(controls).toHaveCount(4);
  const geometry = await controls.evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    const parent = node.parentElement!.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(node);
    const text = range.getBoundingClientRect();
    return {
      width: box.width, height: box.height, groupWidth: parent.width,
      contained: box.left >= Math.max(0, parent.left) - 1 && box.right <= Math.min(innerWidth, parent.right) + 1,
      textContained: text.left >= box.left - 1 && text.right <= box.right + 1 && text.top >= box.top - 1 && text.bottom <= box.bottom + 1,
    };
  }));
  for (const control of geometry) {
    expect(control.contained).toBe(true);
    expect(control.textContained).toBe(true);
    expect(control.height).toBeGreaterThanOrEqual(info.project.name === "desktop-chrome" ? 32 : 44);
    expect(control.height).toBeLessThanOrEqual(52);
    if (info.project.name === "desktop-chrome") {
      // Two equal switches share a group capped at 360px, with a 12px gap.
      expect(control.groupWidth, "Desktop switch groups do not stretch across the entire header").toBeLessThanOrEqual(360);
      expect(control.width, "Each switch stays within half of its compact group").toBeLessThanOrEqual(180);
    }
  }
  for (const pair of [[geometry[0], geometry[1]], [geometry[2], geometry[3]]]) {
    expect(Math.abs(pair[0].width - pair[1].width), "Switches in a group have equal widths").toBeLessThanOrEqual(1);
  }
  for (const [selector, expected] of [
    ['[data-project-display="cards"]', "project-card-mode"],
    ['[data-project-display="table"]', "project-table-mode"],
  ]) {
    await page.locator(selector).click();
    await expect(page.locator(selector)).toHaveClass(/active/);
    await expect(page.locator("#projectRows")).toHaveClass(new RegExp(expected));
  }
  await page.locator('[data-project-list="archive"]').click();
  await expect(page.locator('[data-project-list="archive"]')).toHaveClass(/active/);
  await expect(page.locator("#projectRows [data-open-project]")).toHaveCount(0);
  await page.locator('[data-project-list="active"]').click();
  await expect(page.locator("#projectRows [data-open-project]")).toHaveCount(3);
  await page.locator('#projectRows [data-open-project="1"]').click();
  await expect(page.locator("#projectDetail")).toBeVisible();
  await page.locator("#projectDetail [data-collapse-project-detail]").click();
  await expect(page.locator("#projectDetail")).toBeHidden();
  await expectNoOverflow(page);
});
