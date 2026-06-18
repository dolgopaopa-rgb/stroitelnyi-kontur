import { expect, Page, test } from "@playwright/test";
import { openApp, switchRole } from "../helpers/auth";

const tinyPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

async function ensurePhotoReportFixture(page: Page) {
  return page.evaluate(async (imageBase64) => {
    const projectsResponse = await fetch("/api/projects", { cache: "no-store" });
    if (!projectsResponse.ok) throw new Error("Could not load projects for mobile photo report test.");
    const projects = await projectsResponse.json();
    const project =
      projects.find((item: any) => Number(item.foreman_id || 0) === 7) ||
      projects.find((item: any) => Number(item.foreman_id || 0));
    if (!project) throw new Error("No project with a foreman was found for mobile photo report test.");

    const stamp = Date.now();
    const fileName = `qa-mobile-photo-report-${stamp}-1.png`;
    const secondFileName = `qa-mobile-photo-report-${stamp}-2.png`;
    const createResponse = await fetch("/api/photo-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: project.id,
        report_date: "2026-06-18",
        author_id: Number(project.foreman_id || 7),
        stage: "QA",
        zones: "Mobile QA",
        comment: "QA fixture: mobile photo report must stay readable and open the image.",
        status: "review",
        attachments: [
          {
            title: fileName,
            file_name: fileName,
            mime_type: "image/png",
            file_base64: imageBase64,
          },
          {
            title: secondFileName,
            file_name: secondFileName,
            mime_type: "image/png",
            file_base64: imageBase64,
          },
        ],
      }),
    });
    if (!createResponse.ok) throw new Error(`Could not create mobile QA photo report: ${createResponse.status}`);
    return { projectId: Number(project.id), foremanId: Number(project.foreman_id || 0), fileName, secondFileName };
  }, tinyPng);
}

test("mobile photo reports are readable and images open for foreman and procurement", async ({ page }, testInfo) => {
  const viewport = page.viewportSize();
  test.skip((viewport?.width || 0) > 820, "Mobile photo report layout is checked in the mobile project.");

  await openApp(page, "/today");
  const fixture = await ensurePhotoReportFixture(page);

  for (const role of [`foreman:${fixture.foremanId}`, "procurement_manager"]) {
    const available = await switchRole(page, role);
    expect(available, `${role} must be selectable for mobile photo report access`).toBeTruthy();

    await openApp(page, "/photo-reports");
    await expect(page.locator("#photosView")).toHaveClass(/active/);
    await expect(page.locator('[data-testid="mobile-bottom-nav"]')).toBeVisible();

    const layout = await page.locator(".layout-two.photo-reports-layout").boundingBox();
    expect(layout?.width || 0, `${role}: photo reports layout width`).toBeGreaterThan(Math.min(300, (viewport?.width || 390) - 40));

    const panelWidths = await page.locator(".layout-two.photo-reports-layout > *").evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const element = node as HTMLElement;
          const style = getComputedStyle(element);
          return style.display !== "none" && element.getClientRects().length > 0;
        })
        .map((node) => Math.round((node as HTMLElement).getBoundingClientRect().width))
    );
    expect(Math.min(...panelWidths), `${role}: photo report panels must not become narrow columns`).toBeGreaterThan(
      Math.min(300, (viewport?.width || 390) - 40)
    );

    const card = page.locator('[data-testid="photo-report-card"]').first();
    await expect(card).toBeVisible();
    const cardBox = await card.boundingBox();
    expect(cardBox?.width || 0, `${role}: photo report card width`).toBeGreaterThan(Math.min(300, (viewport?.width || 390) - 40));

    const thumb = page.locator('[data-testid="photo-report-card"] .media-thumb', { hasText: fixture.fileName }).first();
    await expect(thumb).toBeVisible();
    const thumbBox = await thumb.boundingBox();
    expect(thumbBox?.width || 0, `${role}: photo preview thumbnail width`).toBeGreaterThanOrEqual(120);

    const href = await thumb.getAttribute("href");
    expect(href, `${role}: photo preview must have a link`).toBeTruthy();
    const response = await page.request.get(href || "");
    expect(response.status(), `${role}: photo link must open inside Kontur`).toBe(200);
    expect(response.headers()["content-type"] || "", `${role}: photo response must be an image`).toMatch(/^image\//);

    await thumb.click();
    const previewDialog = page.locator('[data-testid="media-preview-dialog"]');
    await expect(previewDialog, `${role}: photo must open in an in-app preview dialog`).toBeVisible();
    await expect(page.locator('[data-testid="media-preview-body"] img'), `${role}: preview dialog must render the image`).toBeVisible();
    await expect(page.locator('[data-testid="media-preview-toolbar"]'), `${role}: preview dialog must expose slideshow controls`).toBeVisible();
    const counter = page.locator('[data-testid="media-preview-counter"]');
    await expect(counter, `${role}: preview counter must show the first slide`).toHaveText(/1 \/ [2-9]\d*/);
    await page.locator('[data-testid="media-preview-next"]').click();
    await expect(counter, `${role}: next button must switch to the second slide`).toHaveText(/2 \/ [2-9]\d*/);
    await page.locator('[data-testid="media-preview-prev"]').click();
    await expect(counter, `${role}: previous button must switch back to the first slide`).toHaveText(/1 \/ [2-9]\d*/);
    await expect(page.locator("#mediaPreviewCloseBottom"), `${role}: preview dialog must have an obvious close/back button`).toBeVisible();
    await page.locator("#mediaPreviewCloseBottom").click();
    await expect(previewDialog, `${role}: preview dialog must close without leaving the app`).not.toBeVisible();
  }
});
