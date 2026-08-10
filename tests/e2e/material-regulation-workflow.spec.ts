import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("material request form exposes the active regulation workflow", async ({ page }) => {
  await openApp(page, "/materials");

  const requestKinds = await page.locator('#materialForm select[name="request_kind"] option').evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value)
  );
  const additionalReasons = await page.locator('#materialForm select[name="additional_reason"] option').evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value).filter(Boolean)
  );

  expect(requestKinds).toEqual(["planned", "additional"]);
  expect(additionalReasons).toEqual(["customer_change", "site_damage", "supplier_defect", "estimate_error"]);
  await expect(page.locator("[data-open-material-regulations]")).toHaveCount(1);
  await expect(page.locator("#materialStageClosureForm")).toHaveCount(1);
  await expect(page.locator("#requestMaterialStageClosureButton")).toHaveCount(1);
  await expect(page.locator("#verifyMaterialStageClosureButton")).toHaveCount(1);
});

test("material regulation form remains usable on a 390px phone", async ({ page }, testInfo) => {
  const viewport = page.viewportSize();
  test.skip((viewport?.width || 0) > 820, "The material dialog layout is checked in the mobile project.");

  await openApp(page, "/materials");
  await expect(page.locator("#newMaterialButton")).toBeVisible();
  await page.locator("#newMaterialButton").click();
  await expect(page.locator("#materialDialog")).toBeVisible();
  await page.locator('#materialForm select[name="request_kind"]').selectOption("additional");
  await expect(page.locator("#materialAdditionalReasonPanel")).toBeVisible();

  const layout = await page.evaluate(() => {
    const dialog = document.querySelector("#materialDialog") as HTMLDialogElement | null;
    const form = document.querySelector("#materialForm") as HTMLElement | null;
    const rect = dialog?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 4,
      dialogLeft: rect?.left ?? -1,
      dialogRight: rect?.right ?? window.innerWidth + 1,
      dialogWidth: rect?.width ?? 0,
      dialogScrollable: Boolean(dialog && dialog.scrollHeight > dialog.clientHeight),
      formScrollable: Boolean(form && form.scrollHeight > form.clientHeight),
      formClientHeight: form?.clientHeight ?? 0,
    };
  });

  expect(layout.pageOverflow, JSON.stringify(layout)).toBeFalsy();
  expect(layout.dialogLeft, JSON.stringify(layout)).toBeGreaterThanOrEqual(0);
  expect(layout.dialogRight, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.dialogWidth, JSON.stringify(layout)).toBeGreaterThan(300);
  expect(layout.formClientHeight, JSON.stringify(layout)).toBeGreaterThan(300);
  expect(layout.dialogScrollable || layout.formScrollable, JSON.stringify(layout)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("material-regulation-mobile-390.png"), fullPage: false });

  const scrollBefore = await page.locator("#materialDialog").evaluate((dialog) => dialog.scrollTop);
  await page.locator("#materialDialog").hover();
  await page.mouse.wheel(0, 700);
  await expect
    .poll(() => page.locator("#materialDialog").evaluate((dialog) => dialog.scrollTop))
    .toBeGreaterThan(scrollBefore);
});

test("completed purchases close an estimate stage only after Smetter entry", async ({ page }) => {
  await openApp(page, "/materials");
  test.skip(!["127.0.0.1", "localhost"].includes(new URL(page.url()).hostname), "Synthetic procurement fixture is local-only.");

  const result = await page.evaluate(async () => {
    const request = async (url: string, body?: Record<string, unknown>) => {
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    };
    const projects = (await request("/api/projects")).body;
    const project = projects.find((item: any) => item.status !== "archived") || projects[0];
    if (!project) return { error: "no_project" };
    const creatorId = Number(project.foreman_id || 7);
    const constructionManagerId = Number(project.construction_manager_id || 2);
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const estimateStage = `QA: закрытие этапа ${Date.now()}`;
    const created = await request("/api/material-requests/bulk", {
      project_id: project.id,
      creator_id: creatorId,
      creator_role: "foreman",
      needed_at: date,
      request_kind: "additional",
      estimate_stage: estimateStage,
      additional_reason: "customer_change",
      additional_reason_details: "QA approved customer change",
      extra_items: [{ material: "QA", name: "Материал для закрытия этапа", unit: "шт", quantity: 2 }],
    });
    if (created.status !== 201) return { error: `create:${created.status}:${created.body.error || ""}` };
    const batchId = Number(created.body.batch_id);
    const materials = (await request("/api/material-requests")).body;
    const material = materials.find((item: any) => Number(item.batch_id) === batchId);
    if (!material) return { error: "material_missing" };

    const actions = [];
    actions.push(await request(`/api/material-request-batches/${batchId}/approve`, {
      actor_role: "owner",
      financial_decision: "bill_customer",
      comment: "QA owner approval",
    }));
    actions.push(await request(`/api/material-request-batches/${batchId}/accept`, { actor_role: "procurement_manager", actor_id: 4 }));
    actions.push(await request(`/api/material-request-batches/${batchId}/order`, {
      actor_role: "procurement_manager",
      actor_id: 4,
      supplier: "QA supplier",
      actual_items: [{ id: material.id, actual_quantity: 2, purchase_date: date, actual_unit_price: 50, actual_total_amount: 100 }],
    }));
    actions.push(await request(`/api/material-request-batches/${batchId}/schedule`, {
      actor_role: "procurement_manager",
      actor_id: 4,
      scheduled_delivery_date: date,
    }));
    actions.push(await request(`/api/material-request-batches/${batchId}/receive`, {
      actor_role: "foreman",
      actor_id: creatorId,
      receipt_status: "received",
    }));
    actions.push(await request(`/api/material-request-batches/${batchId}/mark_smetter`, {
      actor_role: "procurement_manager",
      actor_id: 4,
      smetter_reference: "QA-SMETTER",
    }));
    actions.push(await request("/api/material-stage-closures/request", {
      actor_role: "construction_manager",
      actor_id: constructionManagerId,
      project_id: project.id,
      estimate_stage: estimateStage,
    }));
    actions.push(await request("/api/material-stage-closures/verify", {
      actor_role: "procurement_manager",
      actor_id: 4,
      project_id: project.id,
      estimate_stage: estimateStage,
    }));

    const finalMaterials = (await request("/api/material-requests")).body;
    const finalMaterial = finalMaterials.find((item: any) => Number(item.batch_id) === batchId);
    const closures = (await request(`/api/material-stage-closures?project_id=${project.id}`)).body;
    const closure = closures.find((item: any) => item.estimate_stage === estimateStage);
    return {
      statuses: actions.map((item) => item.status),
      stage: finalMaterial?.batch_stage,
      smetterStatus: finalMaterial?.smetter_status,
      closureStatus: closure?.status,
    };
  });

  expect(result.error).toBeFalsy();
  expect(result.statuses).toEqual([200, 200, 200, 200, 200, 200, 200, 200]);
  expect(result.stage).toBe("closed");
  expect(result.smetterStatus).toBe("entered");
  expect(result.closureStatus).toBe("verified");
});
