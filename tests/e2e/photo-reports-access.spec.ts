import { expect, test } from "@playwright/test";
import { openApp, switchRole } from "../helpers/auth";

test("photo reports are visible to foreman Andrey and procurement", async ({ page }) => {
  await openApp(page, "/today");
  const viewport = page.viewportSize();
  if ((viewport?.width || 0) <= 820) {
    test.skip(true, "Desktop role menu assertions are covered in the desktop project.");
  }

  await page.evaluate(async () => {
    const projectsResponse = await fetch("/api/projects", { cache: "no-store" });
    if (!projectsResponse.ok) throw new Error("Could not load projects for photo report access test.");
    const projects = await projectsResponse.json();
    const andreyProject = projects.find((project: any) => Number(project.foreman_id || 0) === 7);
    if (!andreyProject) throw new Error("No project assigned to foreman Andrey was found.");

    const reportsResponse = await fetch(`/api/photo-reports?project_id=${andreyProject.id}`, { cache: "no-store" });
    if (!reportsResponse.ok) throw new Error("Could not load photo reports for access test.");
    const reports = await reportsResponse.json();
    const hasAttachment = reports.some((report: any) => (report.attachments || []).length);
    if (!reports.length || !hasAttachment) {
      const createResponse = await fetch("/api/photo-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: andreyProject.id,
          report_date: "2026-06-18",
          author_id: 7,
          stage: "QA",
          zones: "QA access",
          comment: "QA photo report for foreman and procurement access checks",
          status: "review",
          attachments: [
            {
              title: "qa-photo-access.png",
              file_name: "qa-photo-access.png",
              mime_type: "image/png",
              file_base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
            },
          ],
        }),
      });
      if (!createResponse.ok) throw new Error(`Could not create QA photo report: ${createResponse.status}`);
    }
  });
  await openApp(page, "/today");

  for (const role of ["foreman:7", "procurement_manager"]) {
    const available = await switchRole(page, role);
    expect(available, `${role} must be available in role switcher`).toBeTruthy();
    await expect(page.locator('[data-testid="nav-photo-reports"]')).toBeVisible();
    await page.locator('[data-testid="nav-photo-reports"]').click();
    await expect(page.locator("#photosView")).toHaveClass(/active/);
    const visibleReportCard = page.locator('#photoReportRows [data-testid="photo-report-card"]').first();
    await expect(visibleReportCard).toBeVisible();
    const photoHref = await visibleReportCard.locator(".media-thumb").first().getAttribute("href");
    expect(photoHref, `${role} must have a downloadable photo link`).toBeTruthy();
    const response = await page.request.get(photoHref || "");
    expect(response.status(), `${role} photo link must open`).toBe(200);
    expect(response.headers()["content-type"] || "").toMatch(/^image\//);
  }
});
