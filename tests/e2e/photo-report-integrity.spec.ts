import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

const tinyPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

test("photo reports require files, link to one task, dedupe and clear no-photo signal", async ({ page }) => {
  await openApp(page, "/today");

  const result = await page.evaluate(async (imageBase64) => {
    const today = new Date().toISOString().slice(0, 10);
    const projectsResponse = await fetch("/api/projects", { cache: "no-store" });
    if (!projectsResponse.ok) throw new Error("Could not load projects.");
    const projects = await projectsResponse.json();
    const project = projects.find((item: any) => item.status !== "archived") || projects[0];
    if (!project) throw new Error("No project found for photo report integrity test.");

    const taskResponse = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: project.id,
        title: `QA A2 фотоотчёт ${Date.now()}`,
        task_type: "photo_report",
        assignee_id: Number(project.foreman_id || 7),
        reviewer_id: 2,
        due_date: today,
        priority: "high",
        description: "QA A2: photo report integrity fixture.",
      }),
    });
    if (!taskResponse.ok) throw new Error(`Could not create task: ${taskResponse.status}`);
    const task = await taskResponse.json();

    const emptyResponse = await fetch("/api/photo-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: project.id,
        report_date: today,
        related_task_ids: [task.id],
        task_id: task.id,
        comment: "QA A2 empty report must be rejected",
        attachments: [],
      }),
    });

    const fileName = `qa-a2-photo-${Date.now()}.png`;
    const validPayload = {
      project_id: project.id,
      report_date: today,
      related_task_ids: [task.id],
      task_id: task.id,
      stage: "QA A2",
      zones: "Integrity",
      comment: "QA A2 valid photo report",
      status: "review",
      attachments: [
        {
          title: fileName,
          file_name: fileName,
          mime_type: "image/png",
          file_base64: imageBase64,
        },
      ],
    };
    const validResponse = await fetch("/api/photo-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });
    const validJson = await validResponse.json();

    const duplicateResponse = await fetch("/api/photo-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validPayload,
        comment: "QA A2 valid photo report retry",
        attachments: [
          {
            title: `retry-${fileName}`,
            file_name: `retry-${fileName}`,
            mime_type: "image/png",
            file_base64: imageBase64,
          },
        ],
      }),
    });
    const duplicateJson = await duplicateResponse.json();

    const reportsResponse = await fetch(`/api/photo-reports?project_id=${project.id}`, { cache: "no-store" });
    const reports = await reportsResponse.json();
    const reportsForTask = reports.filter((report: any) => Number(report.task_id || 0) === Number(task.id));

    const tasksResponse = await fetch("/api/tasks", { cache: "no-store" });
    const tasks = await tasksResponse.json();
    const taskAfter = tasks.find((item: any) => Number(item.id) === Number(task.id));

    return {
      projectTitle: project.title,
      emptyStatus: emptyResponse.status,
      validStatus: validResponse.status,
      duplicateStatus: duplicateResponse.status,
      duplicate: Boolean(duplicateJson.duplicate),
      validTaskId: Number(validJson.task_id || 0),
      duplicateSameId: Number(duplicateJson.id || 0) === Number(validJson.id || 0),
      reportsForTask: reportsForTask.length,
      validReportsForTask: reportsForTask.filter((report: any) => report.is_valid_report !== false && Number(report.files_count || 0) > 0).length,
      invalidEmptyVisible: reports.some((report: any) => report.status_normalized === "invalid_empty" || Number(report.files_count || 0) <= 0),
      taskStatus: taskAfter?.status,
    };
  }, tinyPng);

  expect(result.emptyStatus).toBe(400);
  expect(result.validStatus).toBe(201);
  expect(result.validTaskId).toBeGreaterThan(0);
  expect(result.duplicateStatus).toBe(200);
  expect(result.duplicate).toBeTruthy();
  expect(result.duplicateSameId).toBeTruthy();
  expect(result.reportsForTask).toBe(1);
  expect(result.validReportsForTask).toBe(1);
  expect(result.invalidEmptyVisible).toBeFalsy();
  expect(result.taskStatus).toBe("waiting_check");

  await openApp(page, "/today");
  const noPhotoText = await page.locator("#todayNoPhoto").innerText().catch(() => "");
  expect(noPhotoText).not.toContain(result.projectTitle);
});
