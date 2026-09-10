import { expect, test, type Locator } from "@playwright/test";
import { openApp } from "../helpers/auth";

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ baseURL }) => {
  if (!baseURL) throw new Error("Compact UI tests require a configured local baseURL and synthetic seed data.");
  const url = new URL(baseURL);
  if (!/^https?:$/.test(url.protocol) || !/^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/.test(url.hostname)) {
    throw new Error("Compact UI photo fixtures may only be created on a loopback QA server.");
  }
});

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

async function expectCompactGrid(
  container: Locator,
  items: Locator,
  label: string,
  layout: { columns: number; minWidth: number; maxHeight: number; fillRow?: boolean },
) {
  const parent = await container.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth };
  });
  const rects = await items.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
  }));
  expect(rects.length, `${label}: populated grid`).toBeGreaterThan(0);
  for (const [index, rect] of rects.entries()) {
    expect(rect.left, `${label}: item ${index} left edge`).toBeGreaterThanOrEqual(Math.max(0, parent.left) - 1);
    expect(rect.right, `${label}: item ${index} right edge`).toBeLessThanOrEqual(Math.min(parent.viewport, parent.right) + 1);
    expect(rect.width, `${label}: readable item ${index}`).toBeGreaterThanOrEqual(layout.minWidth);
    expect(rect.height, `${label}: item ${index} minimum height`).toBeGreaterThanOrEqual(40);
    expect(rect.height, `${label}: item ${index} compact height`).toBeLessThanOrEqual(layout.maxHeight);
    const column = index % layout.columns;
    if (column > 0) {
      const previous = rects[index - 1];
      expect(Math.abs(rect.top - previous.top), `${label}: row alignment`).toBeLessThanOrEqual(1);
      expect(Math.abs(rect.height - previous.height), `${label}: equal row heights`).toBeLessThanOrEqual(1);
      expect(rect.left - previous.right, `${label}: horizontal separation`).toBeGreaterThanOrEqual(5);
      expect(Math.abs(rect.width - previous.width), `${label}: equal column widths`).toBeLessThanOrEqual(1);
    } else if (index > 0) {
      const above = rects[index - layout.columns];
      expect(rect.top - above.bottom, `${label}: vertical separation`).toBeGreaterThanOrEqual(5);
      expect(Math.abs(rect.left - above.left), `${label}: column alignment`).toBeLessThanOrEqual(1);
    }
    if (layout.fillRow) {
      const expectedWidth = (parent.width - 6 * (layout.columns - 1)) / layout.columns;
      expect(Math.abs(rect.width - expectedWidth), `${label}: columns use available width`).toBeLessThanOrEqual(1);
    }
  }
}

async function expectClosedTaskSummaries(summaries: Locator, label: string) {
  const geometry = await summaries.evaluateAll((elements) => elements.map((summary) => {
    const errors: string[] = [];
    const contains = (outer: DOMRect, inner: DOMRect) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
    const overlaps = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const rect = summary.getBoundingClientRect();
    const style = getComputedStyle(summary);
    const main = summary.querySelector<HTMLElement>(".task-summary-main")!;
    const title = main.querySelector<HTMLElement>(".task-summary-title")!;
    const meta = main.querySelector<HTMLElement>(".task-summary-meta")!;
    const statuses = main.querySelector<HTMLElement>(":scope > .stack-line")!;
    const blocks = [title, meta, statuses];
    const blockRects = blocks.map((node) => node.getBoundingClientRect());
    if (summary.parentElement!.hasAttribute("open")) errors.push("card must be collapsed");
    if (!contains(summary.parentElement!.getBoundingClientRect(), rect)) errors.push("summary escapes its card");
    if (rect.left < -1 || rect.right > innerWidth + 1) errors.push("summary escapes viewport horizontally");
    if (blockRects.some((box) => !contains(rect, box))) errors.push("content block escapes summary");
    if (blockRects[0].bottom > blockRects[1].top + 1 || blockRects[1].bottom > blockRects[2].top + 1) {
      errors.push("title, metadata and status blocks overlap or are out of order");
    }

    const fragments: { parent: HTMLElement; rect: DOMRect }[] = [];
    const walker = document.createTreeWalker(summary, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const parent = node.parentElement!;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()].filter((box) => box.width > 0 && box.height > 0);
      if (!rects.length || !parent.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
        errors.push(`hidden text: ${node.textContent.trim()}`);
      }
      for (const box of rects) {
        fragments.push({ parent, rect: box });
        // Check every ancestor, so a clipped label cannot pass merely because the card is wide enough.
        for (let ancestor: HTMLElement | null = parent; ancestor; ancestor = ancestor.parentElement) {
          if (!contains(ancestor.getBoundingClientRect(), box)) {
            errors.push(`text escapes ${ancestor.className || ancestor.tagName}: ${node.textContent.trim()}`);
          }
          if (ancestor === summary) break;
        }
      }
    }

    const badges = [...summary.querySelectorAll<HTMLElement>(".pill")];
    if (badges.length !== 3) errors.push("type, status and priority badges must all be present");
    for (const [index, badge] of badges.entries()) {
      const box = badge.getBoundingClientRect();
      if (!contains(rect, box)) errors.push("badge escapes summary");
      if (badges.slice(index + 1).some((other) => overlaps(box, other.getBoundingClientRect()))) errors.push("badges overlap");
      if (fragments.some((fragment) => !badge.contains(fragment.parent) && overlaps(box, fragment.rect))) errors.push("badge overlaps other text");
    }
    const blockContent = blocks.map((block, index) => {
      const lines = fragments.filter((fragment) => block.contains(fragment.parent));
      if (!lines.length) {
        errors.push(`empty content block ${index}`);
        return 0;
      }
      const occupiedHeight = Math.max(...lines.map((line) => line.rect.bottom)) - Math.min(...lines.map((line) => line.rect.top));
      const lineHeight = Math.max(...lines.map((line) => {
        const textStyle = getComputedStyle(line.parent);
        return parseFloat(textStyle.lineHeight) || parseFloat(textStyle.fontSize) * 1.45;
      }));
      // Allow font leading and the badge line box, but not an empty stretched grid track.
      if (blockRects[index].height > occupiedHeight + lineHeight + 1) errors.push(`excess blank space in content block ${index}`);
      return blockRects[index].height;
    });
    if (parseFloat(style.paddingTop) > 12 || parseFloat(style.paddingBottom) > 12 || parseFloat(getComputedStyle(main).rowGap) > 8) {
      errors.push("summary spacing exceeds approved compact spacing");
    }
    return {
      title: title.textContent!.trim(),
      errors,
      height: rect.height,
      // Full text may wrap: the budget grows with content, not with a fixed card height.
      heightBudget: Math.max(112, blockContent.reduce((sum, height) => sum + height, 0) + 24 + 16),
    };
  }));
  expect(geometry.length, `${label}: closed summaries must be present`).toBeGreaterThan(0);
  for (const card of geometry) {
    expect(card.errors, `${label}: ${card.title}`).toEqual([]);
    expect(card.height, `${label}: content-sized summary for ${card.title}`).toBeLessThanOrEqual(card.heightBudget + 1);
  }
}

test("signals keep operational metrics and agent control compact", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await openApp(page, "/signals");

    const metrics = page.locator("#summaryCards .metric");
    await expect(metrics.first()).toBeVisible();
    const metricCount = await metrics.count();
    expect(metricCount, `${viewport.width}px: signal metrics must be present`).toBeGreaterThan(0);
    const summary = page.locator("#summaryCards");
    const summaryWidth = await summary.evaluate((node) => node.getBoundingClientRect().width);
    await expectCompactGrid(summary, metrics, `${viewport.width}px signal metrics`, {
      columns: viewport.width <= 1100 ? 2 : Math.max(1, Math.floor((summaryWidth + 6) / 186)),
      minWidth: 148,
      maxHeight: 58,
      fillRow: viewport.width <= 1100,
    });

    const attentionItems = page.locator("#dashboardAttention .attention-item");
    await expect(attentionItems.first()).toBeVisible();
    expect(await attentionItems.count(), `${viewport.width}px: agent control items must be present`).toBeGreaterThan(0);
    const attention = page.locator("#dashboardAttention .attention-list");
    const attentionWidth = await attention.evaluate((node) => node.getBoundingClientRect().width);
    // The CRM stacks attention items through tablet width, then fits readable 190px columns.
    await expectCompactGrid(attention, attentionItems, `${viewport.width}px agent control`, {
      columns: viewport.width <= 1100 ? 1 : Math.min(await attentionItems.count(), Math.max(1, Math.floor((attentionWidth + 6) / 196))),
      minWidth: viewport.width <= 1100 ? 300 : 190,
      maxHeight: 64,
      fillRow: true,
    });
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
    const projectGeometry = await projectRows.evaluateAll((elements) => elements.map((element) => {
      const row = element.getBoundingClientRect();
      const rowStyle = getComputedStyle(element);
      const main = element.querySelector(".project-card-main")!.getBoundingClientRect();
      const badges = element.querySelector(".project-card-badges")!.getBoundingClientRect();
      const meta = element.querySelector(".project-meta-line")!.getBoundingClientRect();
      return {
        width: row.width,
        height: row.height,
        mainBottom: main.bottom,
        lowerTop: Math.min(badges.top, meta.top),
        padding: Math.max(parseFloat(rowStyle.paddingTop), parseFloat(rowStyle.paddingBottom)),
        // Two content rows, a 7px gap, at most 8px padding per side and a 1px border.
        contentHeightBudget: main.height + Math.max(badges.height, meta.height) + 7 + 16 + 2,
        contained: [main, badges, meta].every((rect) => rect.left >= row.left && rect.right <= row.right && rect.top >= row.top && rect.bottom <= row.bottom),
      };
    }));
    for (const geometry of projectGeometry) {
      expect(geometry.contained, `${viewport.width}px: project content stays inside its card`).toBeTruthy();
      expect(geometry.width, `${viewport.width}px: readable project card`).toBeGreaterThanOrEqual(300);
      expect(geometry.lowerTop, `${viewport.width}px: title and metadata do not overlap`).toBeGreaterThanOrEqual(geometry.mainBottom - 1);
      if (viewport.width >= 1280) {
        expect(geometry.padding, `${viewport.width}px: compact project padding`).toBeLessThanOrEqual(8);
        expect(geometry.height, `${viewport.width}px: compact content-sized project row`).toBeLessThanOrEqual(geometry.contentHeightBudget + 1);
      }
    }
    const switches = page.locator("#projectsView .project-list-tools .segment");
    await expect(switches).toHaveCount(4);
    for (const button of await switches.all()) {
      const rect = await button.boundingBox();
      expect(rect).not.toBeNull();
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width);
      await button.click({ trial: true });
    }
    if (viewport.width >= 1280) {
      const layoutWidth = await projectsLayout.evaluate((element) => element.getBoundingClientRect().width);
      const rowsWidth = await page.locator("#projectRows").evaluate((element) => element.getBoundingClientRect().width);
      expect(rowsWidth / layoutWidth, `${viewport.width}px: project list uses the empty detail space`).toBeGreaterThan(0.95);
    }
    await expectNoPageOverflow(page, `${viewport.width}px objects`);

    await openApp(page, "/tasks");
    const taskCards = page.locator("#taskRows [data-testid='task-card']");
    await expect(taskCards.first()).toBeVisible();
    expect(await taskCards.count(), `${viewport.width}px: task cards must be present`).toBeGreaterThan(0);
    await expect(page.locator("#taskRows [data-testid='task-card'][open]")).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await expectClosedTaskSummaries(taskCards.locator(":scope > .task-summary"), `${viewport.width}px closed tasks`);
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

test("data integrity summary uses an aligned responsive metric grid", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await openApp(page, "/settings");

    const panel = page.locator("#dataIntegrityPanel");
    await expect(panel).toBeVisible();
    const metrics = panel.locator("#dataIntegrityStats .metric");
    await expect(metrics).toHaveCount(4);
    await expectCompactGrid(panel.locator("#dataIntegrityStats"), metrics, `${viewport.width}px integrity metrics`, {
      columns: viewport.width <= 980 ? 2 : 4,
      minWidth: 120,
      maxHeight: 52,
      fillRow: true,
    });
    await expectNoPageOverflow(page, `${viewport.width}px events`);
  }
});
