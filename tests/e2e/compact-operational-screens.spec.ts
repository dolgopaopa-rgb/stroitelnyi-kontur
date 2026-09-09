import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test.use({ serviceWorkers: "block" });

const viewports = [
  { width: 390, height: 844 },
  { width: 852, height: 900 },
  { width: 1280, height: 900 },
  { width: 1440, height: 900 },
];

const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

async function expectNoPageOverflow(page: import("@playwright/test").Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label}: horizontal page overflow`).toBeLessThanOrEqual(1);
}

test("signals keep operational metrics and agent control compact", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await openApp(page, "/signals");

    const metrics = page.locator("#summaryCards .metric");
    await expect(metrics.first()).toBeVisible();
    const metricCount = await metrics.count();
    expect(metricCount, `${viewport.width}px: signal metrics must be present`).toBeGreaterThan(0);
    const metricRects = await metrics.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { top: Math.round(rect.top), height: rect.height };
      }),
    );
    expect(Math.max(...metricRects.map((rect) => rect.top)) - Math.min(...metricRects.map((rect) => rect.top)), `${viewport.width}px: metrics stay in one row`).toBeLessThanOrEqual(1);
    expect(Math.max(...metricRects.map((rect) => rect.height)), `${viewport.width}px: metric height`).toBeLessThanOrEqual(58);

    const attentionItems = page.locator("#dashboardAttention .attention-item");
    await expect(attentionItems.first()).toBeVisible();
    expect(await attentionItems.count(), `${viewport.width}px: agent control items must be present`).toBeGreaterThan(0);
    const attentionRects = await attentionItems.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { top: Math.round(rect.top), height: rect.height };
      }),
    );
    expect(Math.max(...attentionRects.map((rect) => rect.top)) - Math.min(...attentionRects.map((rect) => rect.top)), `${viewport.width}px: agent control stays in one row`).toBeLessThanOrEqual(1);
    expect(Math.max(...attentionRects.map((rect) => rect.height)), `${viewport.width}px: agent control height`).toBeLessThanOrEqual(64);
    await expectNoPageOverflow(page, `${viewport.width}px signals`);
  }
});

test("objects and tasks use aligned compact work grids", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await openApp(page, "/objects");

    const projectsLayout = page.locator("#projectsView .split");
    await expect(projectsLayout).toHaveClass(/project-selection-empty/);
    await expect(page.locator("#projectDetail")).toBeHidden();
    const projectRows = page.locator("#projectRows .row");
    await expect(projectRows.first()).toBeVisible();
    expect(await projectRows.count(), `${viewport.width}px: project rows must be present`).toBeGreaterThan(0);
    const projectTitleWeight = await projectRows.first().locator(".project-card-main strong").evaluate((element) => Number.parseInt(getComputedStyle(element).fontWeight, 10));
    expect(projectTitleWeight, `${viewport.width}px: project title hierarchy`).toBeGreaterThanOrEqual(700);
    const projectCardOverlaps = await projectRows.evaluateAll((elements) =>
      elements.map((element) => {
        const badges = element.querySelector(".project-card-badges")?.getBoundingClientRect();
        const meta = element.querySelector(".project-meta-line")?.getBoundingClientRect();
        if (!badges || !meta) return false;
        return badges.left < meta.right && badges.right > meta.left && badges.top < meta.bottom && badges.bottom > meta.top;
      }),
    );
    expect(projectCardOverlaps.some(Boolean), `${viewport.width}px: project badges and foreman must not overlap`).toBeFalsy();
    if (viewport.width >= 1280) {
      const projectHeights = await projectRows.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
      expect(Math.max(...projectHeights), `${viewport.width}px: compact project row`).toBeLessThanOrEqual(92);
      const layoutWidth = await projectsLayout.evaluate((element) => element.getBoundingClientRect().width);
      const rowsWidth = await page.locator("#projectRows").evaluate((element) => element.getBoundingClientRect().width);
      expect(rowsWidth / layoutWidth, `${viewport.width}px: project list uses the empty detail space`).toBeGreaterThan(0.95);
    }
    await expectNoPageOverflow(page, `${viewport.width}px objects`);

    await openApp(page, "/tasks");
    const taskCards = page.locator("#taskRows [data-testid='task-card']");
    await expect(taskCards.first()).toBeVisible();
    expect(await taskCards.count(), `${viewport.width}px: task cards must be present`).toBeGreaterThan(0);
    const taskSummaryHeights = await taskCards.locator(".task-summary").evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().height)));
    expect(Math.max(...taskSummaryHeights) - Math.min(...taskSummaryHeights), `${viewport.width}px: task cards use equal collapsed height`).toBeLessThanOrEqual(2);
    if (viewport.width > 980) {
      const headingTops = await page.locator("#tasksView .task-object-panel > h3, #tasksView .task-detail-panel > h3").evaluateAll((elements) =>
        elements.map((element) => Math.round(element.getBoundingClientRect().top)),
      );
      expect(headingTops).toHaveLength(2);
      expect(Math.abs(headingTops[0] - headingTops[1]), `${viewport.width}px: task columns start together`).toBeLessThanOrEqual(1);
    }
    await expectNoPageOverflow(page, `${viewport.width}px tasks`);
  }
});

test("photo reports show real thumbnails and keep galleries compact", async ({ page }) => {
  await page.setViewportSize(viewports[0]);
  await openApp(page, "/today");
  await page.evaluate(async (imageBase64) => {
    const projectsResponse = await fetch("/api/projects", { cache: "no-store" });
    const projects = await projectsResponse.json();
    const project = projects.find((item: any) => item.status !== "archived") || projects[0];
    if (!project) throw new Error("No project found for compact photo report fixture.");
    const today = new Date().toISOString().slice(0, 10);
    const taskResponse = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: project.id,
        title: `QA компактный фотоотчёт ${Date.now()}`,
        task_type: "photo_report",
        assignee_id: Number(project.foreman_id || 7),
        reviewer_id: 2,
        due_date: today,
        priority: "normal",
      }),
    });
    if (!taskResponse.ok) throw new Error(`Could not create compact photo task: ${taskResponse.status}`);
    const task = await taskResponse.json();
    const stamp = Date.now();
    const reportResponse = await fetch("/api/photo-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: project.id,
        report_date: today,
        task_id: task.id,
        related_task_ids: [task.id],
        stage: "Монтаж",
        zones: "Первый этаж",
        comment: "Синтетический фотоотчёт для проверки компактной галереи.",
        status: "review",
        attachments: Array.from({ length: 6 }, (_, index) => ({
          title: `qa-compact-photo-${stamp}-${index + 1}.png`,
          file_name: `qa-compact-photo-${stamp}-${index + 1}.png`,
          mime_type: "image/png",
          file_base64: imageBase64,
        })),
      }),
    });
    if (!reportResponse.ok) throw new Error(`Could not create compact photo report: ${reportResponse.status}`);
  }, tinyPng);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const reportsLoaded = page.waitForResponse((response) => response.url().includes("/api/photo-reports") && response.ok());
    await openApp(page, "/photo-reports");
    await reportsLoaded;

    const cards = page.locator("#photoReportRows [data-testid='photo-report-card']");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count(), `${viewport.width}px: photo report cards must be present`).toBeGreaterThan(0);
    const imageLinks = page.locator("#photoReportRows [data-media-preview='image']");
    expect(await imageLinks.count(), `${viewport.width}px: photo reports must include image attachments`).toBeGreaterThan(0);
    const firstImage = imageLinks.first().locator("img");
    await expect(firstImage).toBeVisible();
    expect(await firstImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0), `${viewport.width}px: thumbnail must decode`).toBeTruthy();
    const firstImageResponse = await page.request.get(await imageLinks.first().getAttribute("href") || "");
    expect(firstImageResponse.ok(), `${viewport.width}px: thumbnail endpoint`).toBeTruthy();
    expect(firstImageResponse.headers()["content-type"] || "", `${viewport.width}px: thumbnail content type`).toMatch(/^image\//);

    for (const card of await cards.all()) {
      await expect(card.locator(".photo-report-meta > span")).toHaveCount(3);
      const attachmentCount = await card.locator("[data-media-preview]").count();
      const visibleAttachmentCount = await card.locator("[data-media-preview]:visible").count();
      expect(visibleAttachmentCount, `${viewport.width}px: visible preview limit`).toBeLessThanOrEqual(4);
      if (attachmentCount > 4) await expect(card.locator("[data-open-media-gallery]")).toBeVisible();
    }
    if (viewport.width === 390) {
      const moreButton = page.locator("#photoReportRows [data-open-media-gallery]").first();
      await expect(moreButton).toBeVisible();
      const galleryCard = moreButton.locator("xpath=ancestor::*[@data-testid='photo-report-card'][1]");
      const gallerySize = await galleryCard.locator("[data-media-preview]").count();
      expect(gallerySize).toBeGreaterThan(4);
      await moreButton.click();
      await expect(page.locator("#mediaPreviewDialog")).toBeVisible();
      await expect(page.locator("#mediaPreviewCounter")).toHaveText(`5 / ${gallerySize}`);
      await page.locator("#mediaPreviewNext").click();
      await expect(page.locator("#mediaPreviewCounter")).toHaveText(`6 / ${gallerySize}`);
      await page.locator("#mediaPreviewCloseBottom").click();
    }
    await expectNoPageOverflow(page, `${viewport.width}px photo reports`);
  }
});

test("data integrity summary is a compact horizontal dashboard", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await openApp(page, "/settings");

    const panel = page.locator("#dataIntegrityPanel");
    await expect(panel).toBeVisible();
    const metrics = panel.locator("#dataIntegrityStats .metric");
    await expect(metrics).toHaveCount(4);
    const rects = await metrics.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { top: Math.round(rect.top), height: rect.height };
      }),
    );
    expect(Math.max(...rects.map((rect) => rect.top)) - Math.min(...rects.map((rect) => rect.top)), `${viewport.width}px: integrity metrics stay in one row`).toBeLessThanOrEqual(1);
    expect(Math.max(...rects.map((rect) => rect.height)), `${viewport.width}px: integrity metric height`).toBeLessThanOrEqual(52);
    await expectNoPageOverflow(page, `${viewport.width}px events`);
  }
});
