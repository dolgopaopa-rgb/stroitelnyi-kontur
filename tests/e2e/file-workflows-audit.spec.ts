import { expect, test, Page, APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { openApp } from "../helpers/auth";

/*
 * Isolated integration recipe (PowerShell, from this worktree; two terminals).
 * The coordinator must build app/static/app.compat.js before the final run.
 * Run these assignments in BOTH terminals:
 * $env:APP_DATA_DIR = Join-Path (Get-Location) '.tmp/maria/data'
 * $env:STORAGE_PROVIDER = 'local'
 * $env:MAX_TOKEN = ''
 * $env:KONTUR_BASE_URL = 'http://127.0.0.1:8899'
 * $env:KONTUR_EXTERNAL_BASE_URL = 'http://localhost:8899'
 * $env:APP_PUBLIC_URL = 'http://localhost:8899'
 * $env:APP_ACCESS_ACCOUNTS = 'maria-owner|maria-local-owner|1|owner|0;maria-auditor|maria-local-auditor|12|ai_auditor|0'
 * $env:AUDIT_SOURCE_PREVIEW = '0'
 * Terminal 1:
 * $env:HOST = '127.0.0.1'
 * $env:PORT = '8899'
 * & 'C:\Users\seven\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' app/server.py
 * Terminal 2:
 * node node_modules/playwright/cli.js test tests/e2e/file-workflows-audit.spec.ts --reporter=list --output=.tmp/maria/compiled-run
 * Only baseline/source diagnosis may set AUDIT_SOURCE_PREVIEW=1. Default tests
 * exercise the real compiled asset, real APIs and local synthetic file storage.
 * The general suite intentionally skips these 20 cases; report this run separately.
 */
test.use({ serviceWorkers: "block", httpCredentials: { username: "maria-owner", password: "maria-local-owner" } });
test.beforeEach(async ({ page, baseURL, request }) => {
  const target = new URL(baseURL || "http://invalid");
  const dataDir = path.resolve(process.env.APP_DATA_DIR || "");
  test.skip(
    !["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "8899" ||
    !dataDir.startsWith(path.resolve(".tmp/maria") + path.sep) ||
    process.env.STORAGE_PROVIDER !== "local" || process.env.MAX_TOKEN !== "",
    "Requires explicit local synthetic APP_DATA_DIR=.tmp/maria/data, port 8899, local storage and empty MAX_TOKEN."
  );
  for (const client of [page.context().request, request]) {
    const login = await client.post("/api/login", { data: { login: "maria-owner", password: "maria-local-owner" } });
    expect(login.ok(), await login.text()).toBe(true);
  }
  if (process.env.AUDIT_SOURCE_PREVIEW === "1") {
    await page.route("**/static/app.compat.js?*", async (route) => {
      await route.fulfill({ contentType: "application/javascript", body: await readFile("app/static/app.js", "utf8") });
    });
  }
});

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const csv = (name: string) => Buffer.from(`section;name;unit;quantity;price;total\nQA;${name};pcs;2;3;6\n`);

function syntheticPdf() {
  const content = "BT /F1 18 Tf 30 160 Td (Maria synthetic PDF) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

async function createProject(request: APIRequestContext) {
  const title = unique("Maria synthetic");
  const response = await request.post("/api/projects", { data: { save_mode: "draft", title, customer_name: title } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

async function openPhotoForm(page: Page, projectId: number) {
  await openApp(page, "/photo-reports");
  await page.locator("#newPhotoReportButton").click();
  await page.locator('#photoReportForm [name="project_id"]').selectOption(String(projectId));
  await page.locator('#photoReportForm [name="comment"]').fill(unique("Maria photo"));
}

test("documents: literal title, multiple files, text preview and byte-exact download", async ({ page, request }) => {
  const name = unique("document");
  const title = `<b data-file-audit-injected="yes">${name}</b>`;
  await openApp(page, "/documents");
  await page.locator("#newDocumentButton").click();
  await page.locator('#documentForm [name="title"]').fill(title);
  await page.locator('#documentForm [name="document_files"]').setInputFiles({
    name: `${name}.txt`, mimeType: "text/plain", buffer: Buffer.from("Maria plain text")
  });
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/documents") && r.request().method() === "POST");
  await page.locator("#documentSubmitButton").click();
  expect((await saved).status()).toBe(201);
  await expect(page.locator("#documentDialog")).not.toBeVisible();
  await expect(page.locator("[data-file-audit-injected]")).toHaveCount(0);
  const link = page.locator("#documentCards .document-link").filter({ hasText: name });
  await expect(link.locator("strong")).toHaveText(title);
  await expect(link).toHaveAttribute("data-media-title", title);
  await expect(link).not.toHaveAttribute("onclick");
  await link.click();
  await expect(page.locator("#mediaPreviewDialog")).toBeVisible();
  await expect(page.frameLocator("#mediaPreviewBody iframe").locator("body")).toContainText("Maria plain text");
  await page.locator("#mediaPreviewClose").click();
  await page.locator("#newDocumentButton").click();
  const files = [
    { name: `${name}-чертеж.zip`, mimeType: "application/zip", buffer: Buffer.from("PK synthetic zip fixture") },
    { name: `${name}-2.txt`, mimeType: "text/plain", buffer: Buffer.from("Second synthetic file") },
  ];
  await page.locator('#documentForm [name="document_files"]').setInputFiles(files);
  await page.locator("#documentSubmitButton").click();
  await expect(page.locator("#documentDialog")).not.toBeVisible();
  const docs = await (await request.get("/api/documents?related_type=knowledge_base")).json();
  for (const file of files) {
    const doc = docs.find((item: any) => item.file_name === file.name);
    expect(doc).toBeTruthy();
    const response = await request.get(`/api/documents/${doc.id}/download`);
    expect(response.status()).toBe(200);
    expect(await response.body()).toEqual(file.buffer);
  }
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#documentCards .document-link").filter({ hasText: files[0].name }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(files[0].name);
  expect(await download.failure()).toBeNull();
});

test("estimate import cannot reuse rows from a previously selected file", async ({ page, request }) => {
  const project = await createProject(request);
  await openApp(page, "/materials");
  const form = page.locator("#estimateImportForm");
  await form.locator('[name="project_id"]').selectOption(String(project.id));
  const file = form.locator('[name="estimate_file"]');
  await file.setInputFiles({ name: "first.csv", mimeType: "text/csv", buffer: csv("FIRST") });
  await page.locator("#previewEstimateButton").click();
  await expect(page.locator("#estimatePreviewRows")).toContainText("FIRST");
  await file.setInputFiles({ name: "second.csv", mimeType: "text/csv", buffer: csv("SECOND") });
  await expect(page.locator("#estimatePreviewRows")).not.toContainText("FIRST");
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/estimate-materials/import") && r.method() === "POST");
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/estimate-materials/import") && r.request().method() === "POST");
  await form.locator('button[type="submit"]').click();
  const payload = (await sent).postDataJSON();
  expect(payload.file_name).toBe("second.csv");
  expect(payload.rows.map((row: any) => row.name)).toEqual(["SECOND"]);
  expect((await saved).status()).toBe(201);
});

test("estimate preview rejects wrong extension, handles real parser errors and escapes CSV cells", async ({ page, request }) => {
  const project = await createProject(request);
  await openApp(page, "/materials");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const file = page.locator('#estimateImportForm [name="estimate_file"]');
  await page.locator('#estimateImportForm [name="project_id"]').selectOption(String(project.id));
  await file.setInputFiles({ name: "wrong.exe", mimeType: "application/octet-stream", buffer: csv("REJECTED") });
  await page.locator("#previewEstimateButton").click();
  await expect(page.locator("#toast")).toContainText("Выберите файл .xlsx или CSV");
  await expect(page.locator("#estimatePreviewRows")).not.toContainText("REJECTED");
  await file.setInputFiles({ name: "broken.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("Not a workbook") });
  const failed = page.waitForResponse((r) => r.url().endsWith("/api/estimate-materials/preview-file"));
  await page.locator("#previewEstimateButton").click();
  expect((await failed).ok()).toBe(false);
  await expect(page.locator("#appLoadingOverlay")).toBeHidden();
  await expect(page.locator("#previewEstimateButton")).toBeEnabled();
  const literal = "<b data-csv-audit-injected>Material</b>";
  await file.setInputFiles({ name: "recovery.csv", mimeType: "text/csv", buffer: csv(literal) });
  await page.locator("#previewEstimateButton").click();
  await expect(page.locator("#estimatePreviewRows")).toContainText(literal);
  await expect(page.locator("[data-csv-audit-injected]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("photo upload rejects non-media and empty files before creating a report", async ({ page, request }) => {
  const project = await createProject(request);
  await openPhotoForm(page, project.id);
  const posts: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/api/photo-reports")) posts.push(r.url()); });
  await page.locator('#photoReportForm [name="attachments"]').setInputFiles({ name: "wrong.txt", mimeType: "text/plain", buffer: Buffer.from("Not a photo") });
  await page.locator('#photoReportForm button[type="submit"]').click();
  await expect(page.locator("#toast")).toContainText(/фото|видео/i);
  await expect(page.locator("#photoReportDialog")).toBeVisible();
  expect(posts).toHaveLength(0);
  await page.locator('#photoReportForm [name="attachments"]').setInputFiles({ name: "empty.png", mimeType: "image/png", buffer: Buffer.alloc(0) });
  await page.locator('#photoReportForm button[type="submit"]').click();
  await expect(page.locator("#toast")).toContainText(/пуст/i);
  expect(posts).toHaveLength(0);
});

test("photo server error retains selection, blocks duplicates and retries into a real gallery", async ({ page, request }) => {
  const project = await createProject(request);
  await openPhotoForm(page, project.id);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.locator('#photoReportForm [name="attachments"]').setInputFiles([
    { name: "one.png", mimeType: "image/png", buffer: png },
    { name: "two.png", mimeType: "image/png", buffer: png },
  ]);
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  let attempts = 0;
  await page.route("**/api/photo-reports", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts += 1;
    if (attempts > 1) return route.continue();
    await blocked;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic upload failure" }) });
  });
  const submit = page.locator('#photoReportForm button[type="submit"]');
  await submit.click();
  await expect.poll(() => attempts).toBe(1);
  await expect(page.locator('#photoReportForm [data-file-form-status]')).toBeVisible();
  await expect(page.locator('#photoReportForm [data-file-form-status]')).toContainText("Готовим и сохраняем файлы");
  // An explicit second submit also covers Enter/queued events while FileReader is active.
  await page.locator("#photoReportForm").dispatchEvent("submit");
  const disabled = await submit.isDisabled();
  release();
  await expect(page.locator("#appLoadingOverlay")).toBeHidden();
  expect(disabled).toBe(true);
  expect(attempts).toBe(1);
  await expect(page.locator("#toast")).toContainText("Synthetic upload failure");
  await expect(page.locator('#photoReportForm [data-file-form-status]')).toContainText("Synthetic upload failure");
  await expect(submit).toBeEnabled();
  expect(await page.locator('#photoReportForm [name="attachments"]').evaluate((e: HTMLInputElement) => e.files?.length)).toBe(2);
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/photo-reports") && r.request().method() === "POST");
  await submit.click();
  expect((await saved).status()).toBe(201);
  await expect(page.locator("#photoReportDialog")).not.toBeVisible();
  const card = page.locator(".photo-report-card").filter({ hasText: project.title });
  const thumbs = card.locator("[data-media-preview]");
  await expect(thumbs).toHaveCount(2);
  await thumbs.first().click();
  await expect(page.locator("#mediaPreviewBody img")).toBeVisible();
  await expect.poll(() => page.locator("#mediaPreviewBody img").evaluate((e: HTMLImageElement) => e.naturalWidth)).toBeGreaterThan(0);
  await page.locator("#mediaPreviewNext").click();
  await expect(page.locator("#mediaPreviewCounter")).toHaveText("2 / 2");
  await page.locator("#mediaPreviewPrev").click();
  await expect(page.locator("#mediaPreviewCounter")).toHaveText("1 / 2");
  await page.screenshot({ path: test.info().outputPath("photo-gallery.png") });
  await page.locator("#mediaPreviewCloseBottom").click();
  await expect(page.locator("#photosView")).toHaveClass(/active/);
  expect(errors).toEqual([]);
});

test("real JPEG and JFIF keep names and bytes; missing MIME is normalized; preview retry recovers", async ({ page, request }) => {
  const project = await createProject(request);
  await openPhotoForm(page, project.id);
  const jpeg = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 12;
    canvas.height = 8;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#cf2538";
    ctx.fillRect(0, 0, 12, 8);
    return canvas.toDataURL("image/jpeg").split(",")[1];
  }), "base64");
  const files = [
    { name: "image.jpg", mimeType: "image/jpeg", buffer: jpeg },
    { name: "image.jfif", mimeType: "image/jpeg", buffer: jpeg },
    { name: "no-mime.JFIF", mimeType: "", buffer: jpeg },
  ];
  await page.locator('#photoReportForm [name="attachments"]').setInputFiles(files);
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/photo-reports") && r.method() === "POST");
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/photo-reports") && r.request().method() === "POST");
  await page.locator('#photoReportForm button[type="submit"]').click();
  const payload = (await sent).postDataJSON();
  expect(payload.attachments.map((f: any) => [f.file_name, f.mime_type])).toEqual(files.map((f) => [f.name, "image/jpeg"]));
  expect((await saved).status()).toBe(201);
  await expect(page.locator("#photoReportDialog")).not.toBeVisible();
  const card = page.locator(".photo-report-card").filter({ hasText: project.title });
  const thumbs = card.locator("[data-media-preview]");
  await expect(thumbs).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) {
    const href = (await thumbs.nth(i).getAttribute("href"))!;
    const response = await request.get(href);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/jpeg");
    expect(await response.body()).toEqual(jpeg);
    expect(decodeURIComponent(response.headers()["content-disposition"])).toContain(files[i].name);
    await expect.poll(() => thumbs.nth(i).locator("img").evaluate((e: HTMLImageElement) => e.naturalWidth)).toBe(12);
  }
  const href = (await thumbs.nth(1).getAttribute("href"))!;
  let failDownload = true;
  await page.route(`**${href}`, async (route) => {
    if (failDownload) return route.fulfill({ status: 503, body: "Synthetic download failure" });
    return route.continue();
  });
  // Reload also evicts the already decoded thumbnail used by the previous byte checks.
  await page.reload();
  await expect(thumbs.nth(1)).toHaveAttribute("data-media-unavailable", "1");
  await thumbs.nth(1).click();
  await expect(page.locator("#mediaPreviewBody [role=status]")).toContainText("Не удалось открыть файл");
  failDownload = false;
  await page.locator("#mediaPreviewBody").getByRole("button", { name: "Повторить" }).click();
  await expect.poll(() => page.locator("#mediaPreviewBody img").evaluate((e: HTMLImageElement) => e.naturalWidth)).toBe(12);
  await expect(page.locator("#mediaPreviewBody [role=status]")).toHaveCount(0);
  await page.locator("#mediaPreviewClose").click();
  await expect(page.locator("#photosView")).toHaveClass(/active/);
});

test("estimate files add multiple attachments, replace one and retain old downloadable version", async ({ page, request }) => {
  const title = unique("Maria estimate");
  const created = await request.post("/api/estimate-jobs", { data: {
    title, customer_name: title, manager_id: 3, estimator_id: 5,
    received_at: "2026-09-10", due_date: "2026-09-12", site_costs_policy: "include", status: "estimate_done",
  } });
  expect(created.status(), await created.text()).toBe(201);
  const job = await created.json();
  await openApp(page, "/estimates");
  const row = page.locator(`[data-estimate-job="${job.id}"]`);
  await row.locator("summary").first().click();
  await row.getByRole("button", { name: "Добавить файл", exact: true }).click();
  const form = page.locator("#estimateJobFileForm");
  const input = form.locator('[name="attachments"]');
  await expect(input).toHaveAttribute("accept", /\.jfif/);
  await expect(input).toHaveAttribute("multiple", "");
  const files = [
    { name: "estimate.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("PK synthetic workbook attachment") },
    { name: "brief.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("PK synthetic document attachment") },
  ];
  await input.setInputFiles(files);
  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/estimate-jobs/${job.id}/files`) && r.request().method() === "POST");
  await form.locator('button[type="submit"]').click();
  expect((await saved).ok()).toBe(true);
  await expect(page.locator("#estimateJobFileDialog")).not.toBeVisible();
  const jobs = await (await request.get("/api/estimate-jobs")).json();
  const initial = jobs.find((item: any) => item.id === job.id).files;
  expect(initial).toHaveLength(2);
  for (const file of files) {
    const doc = initial.find((item: any) => item.file_name === file.name);
    const response = await request.get(`/api/estimate-job-files/${doc.id}/download`);
    expect(response.status()).toBe(200);
    expect(await response.body()).toEqual(file.buffer);
  }
  const old = initial.find((item: any) => item.file_name === "estimate.xlsx");
  await row.locator(".estimate-files-group > summary").click();
  await row.locator(`[data-replace-estimate-file="${old.id}"]`).click();
  await expect(input).not.toHaveAttribute("multiple");
  await input.setInputFiles({ name: "estimate-v2.xlsx", mimeType: files[0].mimeType, buffer: Buffer.from("PK replacement attachment") });
  const replaced = page.waitForResponse((r) => r.url().endsWith(`/api/estimate-jobs/${job.id}/files`) && r.request().method() === "POST");
  await form.locator('button[type="submit"]').click();
  expect((await replaced).ok()).toBe(true);
  await expect(page.locator("#estimateJobFileDialog")).not.toBeVisible();
  const after = (await (await request.get("/api/estimate-jobs")).json()).find((item: any) => item.id === job.id).files;
  expect(after).toHaveLength(3);
  expect(Number(after.find((file: any) => file.id === old.id).is_current)).toBe(0);
  expect(await (await request.get(`/api/estimate-job-files/${old.id}/download`)).body()).toEqual(files[0].buffer);
  const current = after.find((file: any) => file.file_name === "estimate-v2.xlsx");
  expect(Number(current.is_current)).toBe(1);
  expect(Number(current.version_no)).toBe(2);
});

test("authenticated auditor has no visible creation or upload controls", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL, serviceWorkers: "block", httpCredentials: { username: "maria-auditor", password: "maria-local-auditor" },
    viewport: test.info().project.use.viewport,
  });
  try {
    const login = await context.request.post("/api/login", { data: { login: "maria-auditor", password: "maria-local-auditor" } });
    expect(login.ok(), await login.text()).toBe(true);
    const session = await (await context.request.get("/api/session")).json();
    test.skip(session.role !== "ai_auditor", "Requires local maria-auditor account with user 12 and no role override.");
    expect(session.user.role).toBe("ai_auditor");
    expect(session.can_switch_role).toBe(false);
    const page = await context.newPage();
    if (process.env.AUDIT_SOURCE_PREVIEW === "1") {
      await page.route("**/static/app.compat.js?*", async (route) => route.fulfill({ contentType: "application/javascript", body: await readFile("app/static/app.js", "utf8") }));
    }
    const posts: string[] = [];
    page.on("request", (r) => { if (r.method() === "POST") posts.push(r.url()); });
    for (const [url, id] of [["/tasks", "newTaskButton"], ["/variations", "newVariationButton"], ["/photo-reports", "newPhotoReportButton"], ["/object-issues", "newObjectRemarkButton"], ["/settings", "newEventButton"]]) {
      await openApp(page, url);
      await expect(page.locator(`#${id}`)).toBeHidden();
      await expect(page.locator(`#${id}`)).toBeDisabled();
      await expect(page.locator("[data-mobile-action]")).toHaveCount(0);
    }
    await openApp(page, "/materials");
    await expect(page.locator('#estimateImportForm [name="estimate_file"]')).toBeHidden();
    await expect(page.locator('#estimateImportForm button[type="submit"]')).toBeHidden();
    await expect(page.locator("#previewEstimateButton")).toBeHidden();
    await page.locator("#estimateImportForm").dispatchEvent("submit");
    expect(posts).toEqual([]);
  } finally {
    await context.close();
  }
});

test("PDF preview shows waiting, closes during loading, handles error and revokes its temporary URL", async ({ page, request }) => {
  await openApp(page, "/documents");
  await page.locator("#newDocumentButton").click();
  const name = `${unique("Maria PDF")}.pdf`;
  const pdf = syntheticPdf();
  await page.locator('#documentForm [name="document_files"]').setInputFiles({ name, mimeType: "application/pdf", buffer: pdf });
  await page.locator("#documentSubmitButton").click();
  await expect(page.locator("#documentDialog")).not.toBeVisible();
  const link = page.locator("#documentCards .document-link").filter({ hasText: name });
  const href = (await link.getAttribute("href"))!;
  const original = await request.get(href);
  expect(original.status()).toBe(200);
  expect(original.headers()["content-type"]).toContain("application/pdf");
  expect(await original.body()).toEqual(pdf);
  let phase = "wait";
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**${href}`, async (route) => {
    if (phase === "wait") {
      await gate;
      await route.continue().catch(() => undefined);
    } else if (phase === "error") {
      await route.fulfill({ status: 502, body: "Synthetic PDF failure" });
    } else {
      await route.continue();
    }
  });
  await link.click();
  await expect(page.locator("#mediaPreviewBody [role=status]")).toHaveText("Загружаем файл");
  await page.screenshot({ path: test.info().outputPath("pdf-waiting.png") });
  await page.locator("#mediaPreviewClose").click();
  await expect(page.locator("#mediaPreviewDialog")).not.toBeVisible();
  phase = "error";
  release();
  await link.click();
  await expect(page.locator("#mediaPreviewBody [role=status]")).toContainText("ошибка 502");
  phase = "success";
  await page.locator("#mediaPreviewBody").getByRole("button", { name: "Повторить" }).click();
  const frame = page.locator("#mediaPreviewBody iframe");
  await expect(frame).toHaveAttribute("src", /^blob:/);
  const blobUrl = (await frame.getAttribute("src"))!;
  await expect(page.locator("#mediaPreviewOpenOriginal")).toHaveAttribute("href", href);
  // Chromium's PDF plugin paints asynchronously after the blob iframe has loaded.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: test.info().outputPath("pdf-preview.png") });
  await page.locator("#mediaPreviewCloseBottom").click();
  expect(await page.evaluate(async (url) => fetch(url).then(() => true, () => false), blobUrl)).toBe(false);
  await expect(page.locator("#mediaPreviewBody")).toBeEmpty();
});

test("synthetic WebM upload is byte-exact and opens playable inline video", async ({ page, request, browser }) => {
  const project = await createProject(request);
  await openPhotoForm(page, project.id);
  // Playwright's bundled encoder avoids platform-dependent MediaRecorder MP4 support.
  const fixtureContext = await browser.newContext({
    viewport: { width: 160, height: 90 },
    recordVideo: { dir: test.info().outputPath("synthetic-video"), size: { width: 160, height: 90 } },
  });
  const fixturePage = await fixtureContext.newPage();
  await fixturePage.setContent('<body style="margin:0;background:#208757">Maria synthetic video</body>');
  await fixturePage.waitForTimeout(500);
  const recording = fixturePage.video()!;
  await fixtureContext.close();
  const video = await readFile(await recording.path());
  expect(video.length, "Synthetic recording must contain encoded video frames").toBeGreaterThan(100);
  const mimeType = "video/webm";
  test.info().annotations.push({ type: "video-format", description: mimeType });
  await page.locator('#photoReportForm [name="attachments"]').setInputFiles({ name: "synthetic.webm", mimeType, buffer: video });
  await page.locator('#photoReportForm button[type="submit"]').click();
  await expect(page.locator("#photoReportDialog")).not.toBeVisible();
  const link = page.locator(".photo-report-card").filter({ hasText: project.title }).locator('[data-media-preview="video"]');
  const href = (await link.getAttribute("href"))!;
  const response = await request.get(href);
  expect(response.status()).toBe(200);
  expect(await response.body()).toEqual(video);
  await link.click();
  await expect(page.locator("#mediaPreviewBody video")).toBeVisible();
  await expect.poll(() => page.locator("#mediaPreviewBody video").evaluate((e: HTMLVideoElement) => e.videoWidth)).toBe(160);
  await expect(page.locator("#mediaPreviewBody [role=status]")).toHaveCount(0);
  await page.locator("#mediaPreviewClose").click();
  await expect(page.locator("#mediaPreviewBody video")).toHaveCount(0);
});
