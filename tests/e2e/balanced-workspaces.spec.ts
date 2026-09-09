import { expect, test, Page } from "@playwright/test";
import { openApp } from "../helpers/auth";

const routes = ["/today", "/tasks", "/locations"];
const matrix = [[320, 568], [360, 640], [375, 667], [390, 844], [430, 932], [720, 840], [832, 750], [768, 1024], [1024, 768], [1280, 720], [1440, 900], [1920, 1080], [3840, 2160]];

async function load(page: Page, route: string) {
  await openApp(page, route);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const visible = (node: HTMLElement) => !!(node.offsetWidth && node.offsetHeight && node.getClientRects().length);
    const commands = [...document.querySelectorAll<HTMLElement>(".view.active button,.view.active summary,.view.active a")].filter(visible);
    const clipped = commands.filter((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const text = range.getBoundingClientRect();
      const box = node.getBoundingClientRect();
      return text.left < box.left - 1 || text.right > box.right + 1 || text.bottom > box.bottom + 1 || text.top < box.top - 1;
    }).map((node) => node.textContent?.trim().slice(0, 100));
    return { overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth, clipped };
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Reflect.deleteProperty(Navigator.prototype, "serviceWorker"));
});

test("director decisions show two items and expand inline without losing state", async ({ page }) => {
  await load(page, "/today");
  const list = page.locator("#todayAttention");
  const details = list.locator(".today-list-disclosure");
  await expect(list.locator(":scope > .decision-item")).toHaveCount(2);
  await expect(details).not.toHaveAttribute("open", "");
  const collapsed = await list.boundingBox();
  if (page.viewportSize()!.width > 1100) {
    const tasksBox = await page.locator("#todayTasks").boundingBox();
    expect(Math.abs(tasksBox!.y - collapsed!.y)).toBeLessThanOrEqual(1);
  }
  const hiddenCount = await details.locator(".decision-item").count();
  expect(hiddenCount).toBeGreaterThan(0);
  const toggle = details.locator("summary");
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open", "");
  await expect(details.locator(".decision-item").last()).toBeVisible();
  expect((await list.boundingBox())!.height).toBeGreaterThan(collapsed!.height + 50);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>("#refreshButton")?.click());
  await page.waitForLoadState("networkidle");
  await expect(details).toHaveAttribute("open", "");
  await toggle.click();
  await expect(details).not.toHaveAttribute("open", "");
  expect((await list.boundingBox())!.height).toBeLessThanOrEqual(collapsed!.height + 1);
  await list.locator("[data-open-task]").first().click();
  await expect(page.locator("#taskDetailDialog")).toBeVisible();
});

test("task columns and location panels have aligned equal widths", async ({ page }, info) => {
  const desktop = info.project.name === "desktop-chrome";
  if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
  await load(page, "/tasks");
  const left = await page.locator(".task-object-panel").boundingBox();
  const right = await page.locator(".task-detail-panel").boundingBox();
  expect(Math.abs(left!.width - right!.width)).toBeLessThanOrEqual(1);
  if (desktop) expect(Math.abs(left!.y - right!.y)).toBeLessThanOrEqual(1);
  const object = await page.locator(".task-project-row").first().boundingBox();
  const task = await page.locator("#taskRows .task-row").first().boundingBox();
  if (desktop) {
    expect(Math.abs(object!.y - task!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(object!.height - task!.height)).toBeLessThanOrEqual(1);
  }
  await expect(page.locator(".task-workflow-label").first()).toBeVisible();
  await page.locator("#taskRows .task-summary").first().click();
  await expect(page.locator("#taskRows .task-row-body").first()).toBeVisible();
  await page.locator(".task-project-row").first().click();
  await expect(page.locator("#taskRows")).not.toBeEmpty();

  await load(page, "/locations");
  const panels = page.locator(".locations-layout > .panel");
  const a = await panels.nth(0).boundingBox();
  const b = await panels.nth(1).boundingBox();
  expect(Math.abs(a!.width - b!.width)).toBeLessThanOrEqual(1);
  if (desktop) {
    expect(Math.abs(a!.y - b!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(a!.height - b!.height)).toBeLessThanOrEqual(1);
  }
  await expect(page.locator("#supplierLocationForm")).toBeVisible();
  await page.locator('#supplierLocationForm input[name="title"]').focus();
  await page.keyboard.press("Tab");
  await expect(page.locator('#supplierLocationForm input[name="address"]')).toBeFocused();
});

test("three workspaces pass viewport matrix and continuous resize", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-chrome", "Sweep runs once; interactions also run in the mobile project.");
  test.setTimeout(240_000);
  const external = new Set<string>();
  const errors: string[] = [];
  page.on("request", (request) => {
    if (!/^(127\.0\.0\.1|localhost)$/.test(new URL(request.url()).hostname)) external.add(new URL(request.url()).origin);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const evidence: object[] = [];
  for (const route of routes) {
    await load(page, route);
    for (const [width, height] of matrix) {
      await page.setViewportSize({ width, height });
      const result = await geometry(page);
      expect(result, `${route} at ${width}x${height}`).toEqual({ overflow: 0, clipped: [] });
      evidence.push({ route, width, height, ...result });
      if ([320, 390, 832, 1440, 1920].includes(width)) await page.screenshot({ path: info.outputPath(`${route.slice(1)}-${width}.png`), fullPage: true });
    }
    const widths = [...new Set([...Array.from({ length: 101 }, (_, index) => 320 + 16 * index), 767, 768, 769, 819, 820, 821, 979, 980, 981, 1099, 1100, 1101, 2560, 3440, 3840])];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const result = await geometry(page);
      expect(result, `${route} resize ${width}`).toEqual({ overflow: 0, clipped: [] });
    }
  }
  expect([...external]).toEqual([]);
  expect(errors).toEqual([]);
  await info.attach("matrix.json", { body: JSON.stringify({ browser: page.context().browser()?.version(), evidence }, null, 2), contentType: "application/json" });
});

test("long text, 200 percent text and short-screen reflow remain readable", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-chrome", "Stress states run once.");
  test.setTimeout(90_000);
  for (const route of routes) {
    await load(page, route);
    // Synthetic browser-only copy, never saved to any database.
    await page.locator(".view.active .row strong,.view.active .decision-item strong").evaluateAll((nodes) => nodes.forEach((node, index) => {
      node.textContent = index % 2 ? "Объект" : "Очень длинное название объекта строительства и задача по согласованию дополнительных работ";
    }));
    for (const width of [320, 390, 832, 1440]) {
      await page.setViewportSize({ width, height: 480 });
      expect(await geometry(page), `${route} long copy at ${width}`).toEqual({ overflow: 0, clipped: [] });
    }
    await page.setViewportSize({ width: 640, height: 480 });
    await page.locator(".view.active *").evaluateAll((nodes) => {
      const sizes = nodes.map((node) => parseFloat(getComputedStyle(node).fontSize));
      nodes.forEach((node, index) => (node as HTMLElement).style.fontSize = `${sizes[index] * 2}px`);
    });
    expect(await geometry(page), `${route} 200% text`).toEqual({ overflow: 0, clipped: [] });
  }
});
