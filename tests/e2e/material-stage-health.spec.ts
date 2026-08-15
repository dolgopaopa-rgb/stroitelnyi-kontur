import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

test("materials expose independent stage and health, including in transit with problem", async ({ page }) => {
  await openApp(page, "/materials");
  await expect(page.locator("#materialsView.active")).toBeVisible();
  await expect(page.locator("[data-material-pipeline-filter]").first()).toBeVisible();

  const pipelineFilters = await page.locator("[data-material-pipeline-filter]").evaluateAll((buttons) =>
    buttons.map((button) => (button as HTMLElement).dataset.materialPipelineFilter)
  );
  expect(pipelineFilters).toEqual(expect.arrayContaining(["all", "needs_approval", "approved", "ordered", "in_transit", "delivered", "problem", "closed"]));

  const result = await page.evaluate(async (neededAt) => {
    const projectsResponse = await fetch("/api/projects", { cache: "no-store" });
    const projects = projectsResponse.ok ? await projectsResponse.json() : [];
    const project = projects.find((item: any) => item.status !== "archived" && Number(item.foreman_id || 0) > 0);
    if (!project) return { error: "no_project_with_foreman" };
    const creatorId = Number(project.foreman_id);
    const createResponse = await fetch("/api/material-requests/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: project.id,
        creator_id: creatorId,
        creator_role: "foreman",
        needed_at: neededAt,
        comment: "QA A3 stage/health fixture",
        extra_items: [
          {
            material: "QA",
            name: "Stage health material",
            unit: "шт",
            quantity: 1,
            reason: "additional_work",
          },
        ],
      }),
    });
    const created = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok) return { error: `create:${createResponse.status}:${created.error || ""}` };
    const batchId = Number(created.batch_id);
    await fetch(`/api/material-request-batches/${batchId}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor_role: "procurement_manager", actor_id: 4 }),
    });
    await fetch(`/api/material-request-batches/${batchId}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduled_delivery_date: neededAt, comment: "QA A3 delivery" }),
    });
    await fetch(`/api/material-request-batches/${batchId}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor_role: "foreman", actor_id: creatorId, receipt_status: "issue", comment: "QA A3 problem on site" }),
    });
    const rowsBeforeLegacy = await (await fetch("/api/material-requests", { cache: "no-store" })).json();
    const request = rowsBeforeLegacy.find((item: any) => Number(item.batch_id) === batchId);
    if (!request) return { error: "request_not_found", batchId };
    await fetch(`/api/material-requests/${request.id}/deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actual_delivery_date: neededAt, procurement_comment: "QA A3 old deliver path preserves problem health" }),
    });
    const rows = await (await fetch("/api/material-requests", { cache: "no-store" })).json();
    const updated = rows.find((item: any) => Number(item.batch_id) === batchId);
    return {
      batchId,
      stage: updated?.batch_stage,
      health: updated?.batch_health,
      status: updated?.batch_status,
    };
  }, tomorrow());

  expect(result.error).toBeFalsy();
  expect(result.stage).toBe("in_transit");
  expect(result.health).toBe("problem");
});
