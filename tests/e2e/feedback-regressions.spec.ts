import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openApp } from "../helpers/auth";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("estimate completion supports multiple files and return to rework", async ({ page }) => {
  await openApp(page, "/estimates");

  const html = readProjectFile("app/static/index.html");
  const app = readProjectFile("app/static/app.js");
  const server = readProjectFile("app/server.py");

  expect(html).toContain('id="estimateJobDoneForm"');
  expect(html).toContain('name="attachments" type="file" multiple');
  expect(app).toContain('data-estimate-job-status="estimate_returned"');
  expect(app).toContain("Вернуть на доработку");
  expect(server).toContain('status == "estimate_returned"');
  expect(server).toContain('row["status"] == "estimate_done"');
  expect(server).toContain('row["status"] in {"estimate_in_work", "estimate_question", "estimate_returned"}');
});

test("extra work items can be edited before final decision", async ({ page }) => {
  await openApp(page, "/works");

  const html = readProjectFile("app/static/index.html");
  const app = readProjectFile("app/static/app.js");
  const server = readProjectFile("app/server.py");

  expect(html).toContain('id="workExtraSubmitButton"');
  expect(html).toContain('id="cancelWorkExtraEditButton"');
  expect(app).toContain("fillWorkExtraForm");
  expect(app).toContain("data-edit-work-extra");
  expect(app).toContain("canEditWorkExtraState");
  expect(server).toContain('^/api/work-extra-items/(\\d+)/update$');
  expect(server).toContain("Эту работу уже нельзя менять: по ней принято решение.");
});
