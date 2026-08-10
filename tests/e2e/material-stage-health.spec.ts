import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

test("materials keep procurement stage and delivery health as separate states", async ({ page }) => {
  await openApp(page, "/materials");
  await expect(page.locator("#materialsView.active")).toBeVisible();
  await expect(page.locator("[data-material-pipeline-filter]").first()).toBeVisible();

  const pipelineFilters = await page.locator("[data-material-pipeline-filter]").evaluateAll((buttons) =>
    buttons.map((button) => (button as HTMLElement).dataset.materialPipelineFilter)
  );
  expect(pipelineFilters).toEqual(expect.arrayContaining(["all", "needs_approval", "approved", "ordered", "in_transit", "delivered", "problem", "closed"]));

  const result = await page.evaluate(async (neededAt) => {
    const json = async (url: string, body?: Record<string, unknown>) => {
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    };
    const projects = (await json("/api/projects")).payload;
    const project = projects.find((item: any) => item.status !== "archived") || projects[0];
    if (!project) return { error: "no_project" };
    const creatorId = Number(project.foreman_id || 7);
    const created = await json("/api/material-requests/bulk", {
      project_id: project.id,
      creator_id: creatorId,
      creator_role: "foreman",
      needed_at: neededAt,
      request_kind: "additional",
      estimate_stage: "QA: этап и состояние",
      additional_reason: "site_damage",
      comment: "QA stage/health fixture",
      extra_items: [{ material: "QA", name: "Материал для проверки этапа", unit: "шт", quantity: 1 }],
    });
    if (!created.response.ok) return { error: `create:${created.response.status}:${created.payload.error || ""}` };
    const batchId = Number(created.payload.batch_id);
    const rows = (await json("/api/material-requests")).payload;
    const request = rows.find((item: any) => Number(item.batch_id) === batchId);
    if (!request) return { error: "request_not_found", batchId };

    const blocked = await json(`/api/material-request-batches/${batchId}/accept`, { actor_role: "procurement_manager", actor_id: 4 });
    const forbiddenApproval = await json(`/api/material-request-batches/${batchId}/approve`, {
      actor_role: "procurement_manager",
      actor_id: 4,
      financial_decision: "company_cost",
    });
    const approval = await json(`/api/material-request-batches/${batchId}/approve`, {
      actor_role: "construction_manager",
      actor_id: Number(project.construction_manager_id || 2),
      financial_decision: "company_cost",
      comment: "QA approval",
    });
    const accepted = await json(`/api/material-request-batches/${batchId}/accept`, { actor_role: "procurement_manager", actor_id: 4 });
    const ordered = await json(`/api/material-request-batches/${batchId}/order`, {
      actor_role: "procurement_manager",
      actor_id: 4,
      supplier: "QA supplier",
      actual_items: [{ id: request.id, actual_quantity: 1, purchase_date: neededAt, actual_unit_price: 100, actual_total_amount: 100 }],
    });
    const scheduled = await json(`/api/material-request-batches/${batchId}/schedule`, {
      actor_role: "procurement_manager",
      actor_id: 4,
      scheduled_delivery_date: neededAt,
    });
    const received = await json(`/api/material-request-batches/${batchId}/receive`, {
      actor_role: "foreman",
      actor_id: creatorId,
      receipt_status: "issue",
      comment: "QA issue on site",
    });
    const closureRequest = await json("/api/material-stage-closures/request", {
      actor_role: "construction_manager",
      actor_id: Number(project.construction_manager_id || 2),
      project_id: project.id,
      estimate_stage: "QA: этап и состояние",
    });
    const blockedClosure = await json("/api/material-stage-closures/verify", {
      actor_role: "procurement_manager",
      actor_id: 4,
      project_id: project.id,
      estimate_stage: "QA: этап и состояние",
    });
    const bypass = await json(`/api/material-requests/${request.id}/deliver`, {
      actor_role: "procurement_manager",
      actor_id: 4,
      actual_delivery_date: neededAt,
    });
    const updatedRows = (await json("/api/material-requests")).payload;
    const updated = updatedRows.find((item: any) => Number(item.batch_id) === batchId);
    return {
      blockedStatus: blocked.response.status,
      forbiddenApprovalStatus: forbiddenApproval.response.status,
      approvalStatus: approval.response.status,
      acceptedStatus: accepted.response.status,
      orderedStatus: ordered.response.status,
      scheduledStatus: scheduled.response.status,
      receivedStatus: received.response.status,
      closureRequestStatus: closureRequest.response.status,
      blockedClosureStatus: blockedClosure.response.status,
      legacyBypassStatus: bypass.response.status,
      stage: updated?.batch_stage,
      health: updated?.batch_health,
      status: updated?.batch_status,
    };
  }, tomorrow());

  expect(result.error).toBeFalsy();
  expect(result.blockedStatus).toBe(400);
  expect(result.forbiddenApprovalStatus).toBe(400);
  expect(result.approvalStatus).toBe(200);
  expect(result.acceptedStatus).toBe(200);
  expect(result.orderedStatus).toBe(200);
  expect(result.scheduledStatus).toBe(200);
  expect(result.receivedStatus).toBe(200);
  expect(result.closureRequestStatus).toBe(200);
  expect(result.blockedClosureStatus).toBe(400);
  expect(result.legacyBypassStatus).toBe(400);
  expect(result.stage).toBe("delivered");
  expect(result.health).toBe("problem");
  expect(result.status).toBe("receipt_issue");
});
