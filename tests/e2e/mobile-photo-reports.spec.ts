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

    const reportResponse = await fetch(`/api/photo-reports?project_id=${project.id}`, { cache: "no-store" });
    if (!reportResponse.ok) throw new Error("Could not load existing photo reports.");
    const reports = await reportResponse.json();
    if (reports.some((report: any) => (report.attachments || []).some((doc: any) => String(doc.mime_type || "").startsWith("image/")))) {
      return { projectId: Number(project.id), foremanId: Number(project.foreman_id || 0) };
    }

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
            title: "qa-mobile-photo-report.png",
            file_name: "qa-mobile-photo-report.png",
            mime_type: "image/png",
            file_base64: imageBase64,
          },
        ],
      }),
    });
    if (!createResponse.ok) throw new Error(`Could not create mobile QA photo report: ${createResponse.status}`);
    return { projectId: Number(project.id), foremanId: Number(project.foreman_id || 0) };
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

    const thumb = page.locator('[data-testid="photo-report-card"] .media-thumb').first();
    await expect(thumb).toBeVisible();
    const thumbBox = await thumb.boundingBox();
    expect(thumbBox?.width || 0, `${role}: photo preview thumbnail width`).toBeGreaterThanOrEqual(120);

    const href = await thumb.getAttribute("href");
    expect(href, `${role}: photo preview must have a link`).toBeTruthy();
    const response = await page.request.get(href || "");
    expect(response.status(), `${role}: photo link must open inside Kontur`).toBe(200);
    expect(response.headers()["content-type"] || "", `${role}: photo response must be an image`).toMatch(/^image\//);
  }
});
