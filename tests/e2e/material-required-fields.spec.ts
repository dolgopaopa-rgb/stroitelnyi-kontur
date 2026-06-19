import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("material stage transitions require needed fields before ordering", async ({ page }) => {
  await openApp(page, "/materials");

  const result = await page.evaluate(async () => {
    const projectsResponse = await fetch("/api/projects", { cache: "no-store" });
    const projects = projectsResponse.ok ? await projectsResponse.json() : [];
    const project = projects.find((item: any) => item.status !== "archived") || projects[0];
    if (!project) return { error: "no_project" };
    const creatorId = Number(project.foreman_id || 7);
    const createResponse = await fetch("/api/material-requests/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: project.id,
        creator_id: creatorId,
        creator_role: "foreman",
        comment: "QA A3 missing needed_at fixture",
        extra_items: [
          {
            material: "QA",
            name: "Missing delivery date material",
            unit: "шт",
            quantity: 1,
            reason: "additional_work",
          },
        ],
      }),
    });
    const created = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok) return { error: `create:${createResponse.status}:${created.error || ""}` };
    const acceptResponse = await fetch(`/api/material-request-batches/${created.batch_id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor_role: "procurement_manager", actor_id: 4 }),
    });
    const acceptText = await acceptResponse.text();
    await fetch(`/api/material-request-batches/${created.batch_id}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor_role: "foreman", actor_id: creatorId }),
    }).catch(() => undefined);
    return { status: acceptResponse.status, text: acceptText };
  });

  expect(result.error).toBeFalsy();
  expect(result.status).toBe(400);
  expect(result.text).toContain("дата");
});
