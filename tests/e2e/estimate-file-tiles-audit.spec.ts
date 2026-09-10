import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test.use({ serviceWorkers: "block" });

const widths = [320, 390, 430, 431, 768, 1440];
const users = [
  { id: 1, role: "owner", name: "Synthetic owner" },
  { id: 2, role: "sales_manager", name: "Synthetic manager" },
  { id: 3, role: "estimator", name: "Synthetic estimator" },
  { id: 7, role: "foreman", name: "Synthetic foreman" },
];
const project = {
  id: 1, title: "Synthetic estimate tile project", customer_name: "Synthetic customer",
  status: "in_progress", sales_manager_id: 2, estimator_id: 3, foreman_id: 7,
};
const files = [
  { id: 9811, title: "Synthetic current estimate with a deliberately long descriptive attachment title", file_name: "synthetic-estimate-foundation-and-roof-materials-detailed-quantities-current-version-02.pdf", mime_type: "application/pdf", version_no: 2, is_current: 1 },
  { id: 9812, title: "Synthetic current floor plan with dimensions and construction annotations", file_name: "synthetic-floor-plan-with-dimensions-construction-annotations-and-section-references-version-03.png", mime_type: "image/png", version_no: 3, is_current: 1 },
  { id: 9813, title: "Synthetic previous estimate with the original quantities retained for comparison", file_name: "synthetic-estimate-foundation-and-roof-materials-detailed-quantities-previous-version-01.pdf", mime_type: "application/pdf", version_no: 1, is_current: 0 },
  { id: 9814, title: "Synthetic previous floor plan with the superseded construction annotations", file_name: "synthetic-floor-plan-with-dimensions-construction-annotations-and-section-references-version-02.png", mime_type: "image/png", version_no: 2, is_current: 0 },
];
const job = {
  id: 9810, title: "Synthetic estimate file tile audit", project_id: 1, project_title: project.title,
  customer_name: project.customer_name, manager_id: 2, estimator_id: 3,
  manager_name: users[1].name, estimator_name: users[2].name,
  status: "estimate_done", received_at: "2026-09-01", due_date: "2099-12-31",
  delivered_at: "2026-09-10", files,
};
const emptyLists = [
  "/api/projects/archive", "/api/tasks", "/api/estimate-materials", "/api/material-requests",
  "/api/photo-reports", "/api/object-remarks", "/api/blockers", "/api/notifications",
  "/api/variations", "/api/contracts", "/api/document-folders", "/api/documents",
  "/api/feedback", "/api/events", "/api/work-items", "/api/work-extra-items",
];

test("estimate file tiles contain long names and all actions across six widths", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "desktop-chrome", "One desktop worker covers the complete viewport loop.");
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("A configured loopback baseURL is required for this mock UI audit.");
  const local = new URL(baseURL);
  expect(local.protocol).toMatch(/^https?:$/);
  expect(local.hostname, "Remote servers are forbidden").toMatch(/^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/);
  const fixtures = new Map<string, unknown>(emptyLists.map((path) => [path, []]));
  fixtures.set("/api/session", { login: "synthetic", role: "owner", user_id: 1, user: users[0], can_switch_role: true });
  fixtures.set("/api/users", users);
  fixtures.set("/api/projects", [project]);
  fixtures.set("/api/estimate-jobs", [job]);
  fixtures.set("/api/summary", { projects: 1, tasks_open: 0, tasks_overdue: 0 });
  fixtures.set("/api/locations", { projects: [], suppliers: [] });
  fixtures.set("/api/data-integrity", { status: "ok", summary: {}, violations: [], violation_counts: {}, warning_counts_by_type: {}, material_counts: {} });
  const blocked: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.context().route("**/*", async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    if (target.origin !== local.origin || !["GET", "HEAD"].includes(request.method())) {
      blocked.push(`${request.method()} ${request.url()}`);
      await route.abort("blockedbyclient");
    } else if (fixtures.has(target.pathname)) {
      await route.fulfill({ json: fixtures.get(target.pathname) });
    } else if (target.pathname.startsWith("/api/")) {
      blocked.push(`Missing UI fixture: ${target.pathname}`);
      await route.abort("blockedbyclient");
    } else {
      await route.continue();
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem("currentRole", "owner");
    Reflect.deleteProperty(Navigator.prototype, "serviceWorker");
  });
  await page.setViewportSize({ width: widths[0], height: 900 });
  await openApp(page, "/estimates");
  await expect(page.locator("#appLoadingOverlay")).toBeHidden();
  const card = page.locator(`[data-estimate-job="${job.id}"]`);
  const group = card.getByTestId("estimate-files-group");
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute("open", "");
  await card.locator(":scope > summary").click();
  await expect(group).not.toHaveAttribute("open", "");
  await group.locator(":scope > summary").click();
  const tiles = group.locator(".estimate-file-card");
  await expect(tiles).toHaveCount(files.length);

  for (const width of widths) {
    await test.step(`${width}px`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const trialFailures: string[] = [];
      for (const file of files) {
        const tile = tiles.filter({ has: page.locator(`[data-print-estimate-file="${file.id}"]`) });
        await expect(tile).toBeVisible();
        await expect(tile.locator("strong")).toHaveText(file.title);
        await expect(tile).toContainText(file.file_name);
        if (file.is_current) await expect(tile).not.toHaveClass(/previous-version/);
        else await expect(tile).toHaveClass(/previous-version/);
        await expect(tile.locator(".estimate-file-actions button")).toHaveCount(file.is_current ? 3 : 2);
        await expect(tile.locator(`[data-replace-estimate-file="${file.id}"]`)).toHaveCount(file.is_current ? 1 : 0);
        await expect(tile.locator(`[data-delete-estimate-file="${file.id}"]`)).toBeVisible();
        const controls = tile.locator(":scope > button, :scope > a, .estimate-file-actions button");
        for (const control of await controls.all()) {
          await expect(control).toBeVisible();
          try {
            // Check reachability without opening, printing, replacing or deleting a file.
            await control.click({ trial: true, timeout: 1500 });
          } catch (error) {
            trialFailures.push(`${file.id}: ${String(error)}`);
          }
        }
      }
      const geometry = await group.locator(".estimate-job-files").evaluate((grid) => {
        const contains = (outer: DOMRect, inner: DOMRect) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
        const overlaps = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        const gridStyle = getComputedStyle(grid);
        const gridRect = grid.getBoundingClientRect();
        const nodes = [...grid.querySelectorAll<HTMLElement>(".estimate-file-card")];
        const tileRects = nodes.map((node) => node.getBoundingClientRect());
        const errors: string[] = [];
        const details = nodes.map((tile, index) => {
          const rect = tileRects[index];
          if (!contains(gridRect, rect) || rect.left < -1 || rect.right > innerWidth + 1) errors.push(`tile ${index}: outside grid or viewport`);
          if (tileRects.slice(index + 1).some((other) => overlaps(rect, other))) errors.push(`tile ${index}: overlaps another tile`);
          const controls = [...tile.querySelectorAll<HTMLElement>(":scope > button, :scope > a, .estimate-file-actions button")];
          const controlRects = controls.map((control) => control.getBoundingClientRect());
          for (const [controlIndex, control] of controls.entries()) {
            const box = controlRects[controlIndex];
            if (!contains(rect, box)) errors.push(`tile ${index}: ${control.textContent?.trim()} escapes tile`);
            if (controlRects.slice(controlIndex + 1).some((other) => overlaps(box, other))) errors.push(`tile ${index}: controls overlap`);
          }
          const walker = document.createTreeWalker(tile, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.textContent?.trim()) continue;
            const parent = node.parentElement!;
            const range = document.createRange();
            range.selectNodeContents(node);
            const fragments = [...range.getClientRects()].filter((box) => box.width > 0 && box.height > 0);
            if (!fragments.length || !parent.checkVisibility({ opacityProperty: true, visibilityProperty: true })) errors.push(`tile ${index}: hidden text ${node.textContent.trim()}`);
            for (const fragment of fragments) {
              for (let ancestor: HTMLElement | null = parent; ancestor; ancestor = ancestor.parentElement) {
                if (!contains(ancestor.getBoundingClientRect(), fragment)) errors.push(`tile ${index}: text escapes ${ancestor.className || ancestor.tagName}: ${node.textContent.trim()}`);
                if (ancestor === tile) break;
              }
              if (controls.some((control, controlIndex) => !control.contains(parent) && overlaps(controlRects[controlIndex], fragment))) errors.push(`tile ${index}: text overlaps another control`);
            }
          }
          return {
            file: tile.querySelector("strong")!.textContent,
            width: rect.width, height: rect.height, top: rect.top,
            controls: controls.map((control, controlIndex) => ({ text: control.textContent?.trim(), width: controlRects[controlIndex].width, height: controlRects[controlIndex].height })),
          };
        });
        return {
          columns: gridStyle.gridTemplateColumns.trim().split(/\s+/).length,
          contentWidth: grid.clientWidth - parseFloat(gridStyle.paddingLeft) - parseFloat(gridStyle.paddingRight),
          gap: parseFloat(gridStyle.columnGap),
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
          errors, tiles: details,
        };
      });
      await info.attach(`estimate-tiles-${width}-geometry`, { body: Buffer.from(JSON.stringify({ width, ...geometry, trialFailures }, null, 2)), contentType: "application/json" });
      await group.screenshot({ path: info.outputPath(`estimate-tiles-${width}.png`) });
      expect.soft(geometry.errors, `${width}px: text and controls stay inside each tile`).toEqual([]);
      expect.soft(geometry.overflow, `${width}px: page overflow`).toBeLessThanOrEqual(1);
      const expectedColumns = width <= 430 ? 2 : Math.max(1, Math.floor((geometry.contentWidth + geometry.gap) / (145 + geometry.gap)));
      expect.soft(geometry.columns, `${width}px: approved responsive file columns`).toBe(expectedColumns);
      if (width <= 430) expect.soft(Math.abs(geometry.tiles[0].top - geometry.tiles[1].top), `${width}px: first two tiles share a row`).toBeLessThanOrEqual(1);
      if (width <= 1100) {
        for (const tile of geometry.tiles) {
          for (const control of tile.controls) {
            expect.soft(control.width, `${width}px: ${control.text} touch target width`).toBeGreaterThanOrEqual(44);
            expect.soft(control.height, `${width}px: ${control.text} touch target height`).toBeGreaterThanOrEqual(44);
          }
        }
      }
      expect.soft(trialFailures, `${width}px: all file controls reachable without executing actions`).toEqual([]);
    });
  }
  expect(blocked, "No remote requests, backend mutations or unmocked API reads").toEqual([]);
  expect(pageErrors, "No application exceptions").toEqual([]);
});
