import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { openApp } from "../helpers/auth";

const roles = ["owner", "sales_manager", "estimator", "construction_manager",
  "procurement_manager", "technical_supervisor", "foreman"] as const;
const users = roles.map((role, index) => ({ id: index + 1, role, name: `QA ${role}`, is_active: 1 }));
// These existing Today profiles deliberately omit Active Objects; do not invent role access.
const withoutActiveObjects = new Set<string>(["estimator", "procurement_manager"]);
const now = new Date("2026-09-15T09:00:00.000Z");
const projects = [1, 2, 3].map((id) => ({
  id,
  title: id === 1 ? "QA Object 1" : id === 2
    ? "QA Object 2 - Long residential construction project with several buildings and extended finishing works"
    : "QAObject3VeryLongUnbrokenSyntheticProjectIdentifierABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  customer_id: id, customer_name: `QA Customer ${id}`,
  customer_phone: "+7-000-000-00-00", customer_email: "qa@example.invalid",
  status: id === 1 ? "in_progress" : "waiting_project_documentation",
  address: `QA Address ${id}`, smetter_ref: "SYNTHETIC-QA",
  sales_manager_id: 2, estimator_id: 3, construction_manager_id: 4,
  procurement_manager_id: 5, tech_supervisor_id: 6, foreman_id: 7,
  foreman_name: "QA Foreman", planned_end_date: "2099-12-31",
  main_estimate_amount: 100000, approved_variations_amount: 0, unresolved_overbudget_amount: 0,
}));
const tasks = projects.map((project) => ({
  id: 9600 + project.id, project_id: project.id, project_title: project.title,
  title: `QA Task ${project.id}`, description: "Synthetic object-card regression.",
  assignee_id: 7, assignee_name: "QA Foreman", assignee_role: "foreman",
  project_foreman_id: 7, creator_id: 1, creator_name: "QA Owner",
  reviewer_id: 1, reviewer_name: "QA Owner", due_date: "2026-09-01",
  status: "in_progress", status_key: "in_progress", task_type: "task",
  priority: "normal", is_execution_overdue: true, is_review_overdue: false,
  events: [], attachments: [],
}));
const materials = projects.map((project) => ({
  id: 9700 + project.id, batch_id: 9700 + project.id, project_id: project.id,
  project_title: project.title, title: `QA Material ${project.id}`,
  creator_id: 7, creator_name: "QA Foreman", creator_role: "foreman", project_foreman_id: 7,
  batch_status: "new", batch_stage: "request", batch_health: "problem",
  batch_created_at: now.toISOString(), needed_at: "2026-09-01", basis_type: "main_estimate",
  requested_quantity: 2, requested_unit: "pcs", estimated_quantity: 10,
  unit_price: 100, total_amount: 200, delivery_urgency: "standard",
}));
const emptyLists = [
  "/api/projects/archive", "/api/estimate-jobs", "/api/estimate-materials", "/api/photo-reports",
  "/api/object-remarks", "/api/blockers", "/api/variations", "/api/contracts",
  "/api/document-folders", "/api/documents", "/api/feedback", "/api/events",
  "/api/work-items", "/api/work-extra-items", "/api/notifications",
];
const observations = new WeakMap<Page, { blocked: string[]; errors: string[] }>();

async function setup(page: Page, baseURL: string | undefined, role: string, density: string) {
  expect(baseURL, "Only this suite's isolated server is allowed").toBe("http://127.0.0.1:8915");
  const origin = new URL(baseURL!).origin;
  const observed = { blocked: [] as string[], errors: [] as string[] };
  observations.set(page, observed);
  page.on("pageerror", (error) => observed.errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") observed.errors.push(message.text()); });
  const user = users.find((item) => item.role === role)!;
  // Same deny-by-default synthetic API approach as compact-panels-20260911.
  const fixtures = new Map<string, unknown>(emptyLists.map((path) => [path, []]));
  fixtures.set("/api/session", { login: "synthetic", role, user_id: user.id, user, can_switch_role: true });
  fixtures.set("/api/users", users);
  fixtures.set("/api/projects", projects);
  fixtures.set("/api/tasks", tasks);
  fixtures.set("/api/summary", { projects: 3, pending_handover: 0, construction_review: 0, tasks_open: 3, tasks_overdue: 3 });
  fixtures.set("/api/locations", { projects, suppliers: [] });
  fixtures.set("/api/data-integrity", { status: "ok", summary: {}, violations: [], violation_counts: {}, warning_counts_by_type: {}, material_counts: {} });
  for (const project of projects) fixtures.set(`/api/projects/${project.id}`, {
    ...project, customer_projects_count: 1,
    tasks: tasks.filter((task) => task.project_id === project.id),
    materials: materials.filter((item) => item.project_id === project.id),
    estimate_materials: [], variations: [], works: [], extra_works: [], contracts: [],
    photo_reports: [], documents: [], object_remarks: [], blockers: [], events: [], timeline: [],
  });
  for (const task of tasks) fixtures.set(`/api/tasks/${task.id}`, task);
  await page.context().route("**/*", async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    if (target.origin !== origin || !["GET", "HEAD"].includes(request.method())) {
      observed.blocked.push(`${request.method()} ${target.origin}${target.pathname}`);
      await route.abort("blockedbyclient");
    } else if (target.pathname === "/api/material-requests") {
      await route.fulfill({ json: target.searchParams.get("archive") === "1" ? [] : materials });
    } else if (fixtures.has(target.pathname)) {
      await route.fulfill({ json: fixtures.get(target.pathname) });
    } else if (target.pathname.startsWith("/api/") || target.pathname === "/login") {
      observed.blocked.push(`Unmocked API/auth: ${target.pathname}`);
      await route.abort("blockedbyclient");
    } else if (request.resourceType() === "document" || target.pathname.startsWith("/static/") || target.pathname === "/favicon.ico") {
      await route.continue();
    } else {
      observed.blocked.push(`Unexpected local resource: ${target.pathname}`);
      await route.abort("blockedbyclient");
    }
  });
  await page.context().routeWebSocket("**/*", (socket) => {
    observed.blocked.push(`WebSocket: ${socket.url()}`);
    socket.close();
  });
  await page.clock.setFixedTime(now);
  await page.addInitScript(({ role, density }) => {
    localStorage.setItem("currentRole", role);
    localStorage.setItem("uiDensityMode", density);
    Reflect.deleteProperty(Navigator.prototype, "serviceWorker");
  }, { role, density });
  await openApp(page, "/today");
  await expect(page.locator("#appLoadingOverlay")).toBeHidden();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#todayView")).toHaveAttribute("data-role", role);
  await expect(page.locator("body")).toHaveClass(new RegExp(`density-${density}`));
  await expect(page.locator("#todayObjects .today-object-card")).toHaveCount(withoutActiveObjects.has(role) ? 0 : 3);
}

test.afterEach(async ({ page }, info) => {
  const observed = observations.get(page);
  await info.attach("network-and-browser-observations", {
    body: JSON.stringify(observed, null, 2), contentType: "application/json",
  });
  expect.soft(observed?.blocked, "No external calls, backend mutations or unmocked reads").toEqual([]);
  expect.soft(observed?.errors, "No browser errors").toEqual([]);
});

async function screenshot(page: Page, info: TestInfo, label: string) {
  const path = info.outputPath(`${label}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(label, { path, contentType: "image/png" });
}

async function semantics(page: Page) {
  const cards = page.locator("#todayObjects .today-object-card");
  const ids: string[] = [];
  for (const project of projects) {
    const card = cards.filter({ has: page.locator(`[data-toggle-today-project="${project.id}"]`) });
    await expect(card).toHaveCount(1);
    const title = card.locator(".today-object-title[data-open-project]");
    await expect(title).toHaveText(project.title);
    await expect(title).toHaveAttribute("data-open-project", String(project.id));
    expect(await title.evaluate((node) => node.matches("button, a[href]")), "Native button/link title").toBe(true);
    await expect(card.locator("[data-open-project]"), "No redundant Open action").toHaveCount(1);
    const toggle = card.locator(".today-object-toggle[data-toggle-today-project]");
    await expect(toggle).toHaveJSProperty("tagName", "BUTTON");
    await expect(toggle).toHaveAttribute("type", "button");
    await expect(toggle).toHaveAttribute("aria-label", /\S/);
    await expect(toggle).toHaveAttribute("title", /\S/);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect((await toggle.innerText()).trim(), "Chevron-only, no visible disclosure text").toBe("");
    await expect(toggle.locator("svg")).toHaveCount(1);
    const id = await toggle.getAttribute("aria-controls");
    expect(id, "Stable single panel ID").toMatch(/^\S+$/);
    ids.push(id!);
    expect(await page.locator("[id]").evaluateAll((nodes, id) => nodes.filter((node) => node.id === id).length, id)).toBe(0);
    await expect(card.locator(".today-object-details")).toHaveCount(0);
  }
  expect(new Set(ids).size, "Every object has a unique controlled panel ID").toBe(projects.length);
}

async function keyboardCycle(page: Page, card: Locator, key: "Enter" | "Space") {
  const toggle = card.locator(".today-object-toggle");
  const id = await toggle.getAttribute("aria-controls");
  const panel = page.locator(`[id="${id}"]`);
  await toggle.focus();
  await page.keyboard.press(key);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toHaveCount(1);
  await expect(panel).toBeVisible();
  await expect(card.locator(".today-object-details")).toHaveAttribute("id", id!);
  await expect(toggle, "Focus restored after DOM rerender").toBeFocused();
  // Deliberately do not refocus: a second consecutive key must hit the replacement button.
  await page.keyboard.press(key);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveAttribute("aria-controls", id!);
  await expect(panel).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await expect(page.locator("#todayView")).toHaveClass(/active/);
}

async function hoverAndStroke(page: Page, info: TestInfo) {
  const card = page.locator('[data-today-project-card="1"]');
  const title = card.locator(".today-object-title");
  const toggle = card.locator(".today-object-toggle");
  for (const [label, control] of [["title", title], ["toggle", toggle]] as const) {
    await control.hover();
    const style = await control.evaluate((node) => {
      const css = getComputedStyle(node);
      const channels = css.backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
      return {
        background: css.backgroundColor, image: css.backgroundImage,
        transparent: css.backgroundColor === "transparent" || (channels.length === 4 && channels[3] === 0),
        red: channels.length >= 3 && (channels.length < 4 || channels[3] > 0) &&
          channels[0] > channels[1] + 30 && channels[0] > channels[2] + 30,
      };
    });
    expect.soft(style.red, `${label}: hover must not inherit the generic red button background (${style.background})`).toBe(false);
    expect.soft(style.image, `${label}: no background image obscuring the control`).toBe("none");
    if (label === "title") expect.soft(style.transparent, "Title remains a text link on hover").toBe(true);
    await info.attach(`${label}-hover`, { body: await control.screenshot({ animations: "disabled" }), contentType: "image/png" });
  }
  const svg = toggle.locator("svg");
  await expect(svg).toBeVisible();
  const icon = await svg.evaluate((node: SVGSVGElement) => {
    const use = node.querySelector("use");
    const href = use?.getAttribute("href") || "";
    const reference = href.startsWith("#") ? document.getElementById(href.slice(1)) : null;
    const css = getComputedStyle(use || node);
    const bounds = node.getBBox();
    return { stroke: css.stroke, strokeWidth: Number.parseFloat(css.strokeWidth),
      opacity: Number(css.opacity) * Number(css.strokeOpacity),
      referencePresent: Boolean(reference?.querySelector("path, polyline, line")),
      width: bounds.width, height: bounds.height };
  });
  expect.soft(icon.referencePresent, "Chevron use resolves to actual vector geometry").toBe(true);
  expect.soft(icon.stroke, "SVG has a painted stroke").not.toMatch(/^(none|transparent|rgba\(0, 0, 0, 0\))$/);
  expect.soft(icon.strokeWidth).toBeGreaterThan(0);
  expect.soft(icon.opacity).toBeGreaterThan(0);
  expect.soft(icon.width).toBeGreaterThan(0);
  expect.soft(icon.height).toBeGreaterThan(0);
  const painted = await toggle.screenshot({ animations: "disabled" });
  // Pixel evidence: hiding only the SVG must change the rendered button, not just its DOM.
  const previousStyle = await svg.getAttribute("style");
  await svg.evaluate((node: SVGElement) => { node.style.visibility = "hidden"; });
  const empty = await toggle.screenshot({ animations: "disabled" });
  await svg.evaluate((node, previous) => {
    if (previous === null) node.removeAttribute("style");
    else node.setAttribute("style", previous);
  }, previousStyle);
  expect.soft(painted.equals(empty), "Chevron contributes visible pixels").toBe(false);
  await page.mouse.move(0, 0);
}

async function geometry(page: Page, label: string) {
  const results = await page.locator("#todayObjects .today-object-card").evaluateAll((cards) => cards.map((card) => {
    const rect = card.getBoundingClientRect();
    const head = card.querySelector(".today-object-head")!;
    const metrics = card.querySelector(".today-object-metrics")!;
    const toggle = card.querySelector(".today-object-toggle")!;
    const title = card.querySelector(".today-object-title")!;
    const svg = toggle.querySelector("svg")!;
    const box = (node: Element) => {
      const r = node.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const nodes = [head, metrics, title, toggle, ...head.querySelectorAll(".pill"), ...metrics.querySelectorAll(".pill")];
    const leaves = [title, toggle, ...head.querySelectorAll(".pill"), ...metrics.querySelectorAll(".pill")];
    const overlapping: string[] = [];
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
      const a = box(leaves[i]), b = box(leaves[j]);
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) {
        overlapping.push(`${leaves[i].className} / ${leaves[j].className}`);
      }
    }
    const textOverflow = [title, ...card.querySelectorAll(".pill")].filter((node) => {
      const r = box(node), range = document.createRange();
      range.selectNodeContents(node);
      return [...range.getClientRects()].some((t) =>
        t.left < r.left - 1 || t.right > r.right + 1 || t.top < r.top - 1 || t.bottom > r.bottom + 1);
    }).map((node) => node.textContent);
    return {
      title: title.textContent, width: rect.width,
      gap: box(metrics).top - box(head).bottom,
      touch: box(toggle), svg: box(svg), overlapping, textOverflow,
      overflow: card.scrollWidth - card.clientWidth,
      outside: nodes.filter((node) => {
        const r = box(node);
        return r.left < rect.left - 1 || r.right > rect.right + 1 ||
          r.top < rect.top - 1 || r.bottom > rect.bottom + 1 ||
          node.scrollWidth > node.clientWidth + 1;
      }).map((node) => node.className),
    };
  }));
  expect.soft(results.length, label).toBe(3);
  for (const item of results) {
    const context = `${label}: ${item.title}`;
    expect.soft(item.gap, `${context}: metrics gap from whole header`).toBeGreaterThanOrEqual(8);
    expect.soft(item.touch.width, `${context}: touch width`).toBeGreaterThanOrEqual(44);
    expect.soft(item.touch.height, `${context}: touch height`).toBeGreaterThanOrEqual(44);
    expect.soft(item.svg.width, `${context}: SVG width`).toBeCloseTo(18, 0);
    expect.soft(item.svg.height, `${context}: SVG height`).toBeCloseTo(18, 0);
    expect.soft(item.overlapping, `${context}: no overlapping controls/pills`).toEqual([]);
    expect.soft(item.textOverflow, `${context}: text fits`).toEqual([]);
    expect.soft(item.overflow, `${context}: card overflow`).toBeLessThanOrEqual(1);
    expect.soft(item.outside, `${context}: descendants contained`).toEqual([]);
  }
  expect.soft(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth),
    `${label}: page overflow`).toBeLessThanOrEqual(1);
  return results;
}

for (const role of roles) for (const density of ["compact", "comfortable"]) {
  test.describe(`${role} / ${density}`, () => {
    test.beforeEach(async ({ page, baseURL }) => setup(page, baseURL, role, density));

    if (withoutActiveObjects.has(role)) {
      test("existing role profile keeps Active Objects absent", async ({ page }) => {
        await expect(page.locator("#todayObjects")).toBeHidden();
        await expect(page.locator("#todayObjects .today-object-card")).toHaveCount(0);
      });
      return;
    }

    if (role === "owner" || role === "sales_manager") {
      test("visual baseline for Active Objects", async ({ page }) => {
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator("#todayObjects")).toHaveScreenshot(`active-objects-${role}-${density}.png`, {
          animations: "disabled", caret: "hide", scale: "css", maxDiffPixels: 0,
        });
      });
    }

    test("shared semantics, consecutive keyboard toggles and title opens object", async ({ page }, info) => {
      await screenshot(page, info, "collapsed");
      await semantics(page);
      await hoverAndStroke(page, info);
      for (const key of ["Enter", "Space"] as const) {
        await keyboardCycle(page, page.locator('[data-today-project-card="2"]'), key);
      }
      const cards = page.locator("#todayObjects .today-object-card");
      for (const card of await cards.all()) await card.locator(".today-object-toggle").click();
      await expect(page.locator("#todayObjects .today-object-details")).toHaveCount(3);
      const ids = await page.locator("#todayObjects .today-object-details").evaluateAll((nodes) => nodes.map((node) => node.id));
      expect(new Set(ids).size).toBe(3);
      await screenshot(page, info, "expanded");
      await geometry(page, "expanded");
      const title = page.locator('[data-today-project-card="2"] .today-object-title');
      await title.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#projectsView")).toHaveClass(/active/);
      await expect(page.locator("#projectDetail")).toBeVisible();
      await expect(page.locator("#projectDetail")).toContainText(projects[1].title);
    });

    test("responsive geometry with long titles and status", async ({ page }, info) => {
      const widths = info.project.name === "desktop-chrome"
        ? [768, 981, 1024, 1101, 1180, 1440] : [320, 360, 375, 390, 430];
      for (const width of widths) {
        await test.step(`${width}px`, async () => {
          await page.setViewportSize({ width, height: info.project.name === "desktop-chrome" ? 900 : 844 });
          await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          if (width === 1440 || width === 390) await screenshot(page, info, `viewport-${width}`);
          await geometry(page, `${role}/${density}/${width}`);
          for (const toggle of await page.locator("#todayObjects .today-object-toggle").all()) await toggle.click();
          await expect(page.locator("#todayObjects .today-object-details")).toHaveCount(3);
          await geometry(page, `${role}/${density}/${width}/expanded`);
          if (width === 1440 || width === 390) await screenshot(page, info, `viewport-${width}-expanded`);
          for (const toggle of await page.locator("#todayObjects .today-object-toggle").all()) await toggle.click();
          await expect(page.locator("#todayObjects .today-object-details")).toHaveCount(0);
        });
      }
      if (role === "sales_manager" && info.project.name === "desktop-chrome") {
        await page.setViewportSize({ width: 1440, height: 900 });
        // A scoped fixture constraint exercises a narrow manager column without changing product CSS.
        await page.locator("#todayObjects").evaluate((node: HTMLElement) => {
          node.style.width = "280px";
          node.style.maxWidth = "100%";
          node.style.gridTemplateColumns = "minmax(0, 1fr)";
        });
        await screenshot(page, info, "narrow-manager-280");
        const result = await geometry(page, "narrow-manager-280");
        for (const card of result) expect(card.width).toBeLessThanOrEqual(280);
      }
    });
  });
}
