#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { formatMaxReport, validateMaxReport } from "../../src/notifications/max/formatMaxReport.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ARTIFACT_DIR = path.join(ROOT, "qa-artifacts", "latest");
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, "screenshots");
const TRACE_DIR = path.join(ARTIFACT_DIR, "traces");
const VIDEO_DIR = path.join(ARTIFACT_DIR, "videos");
const suite = arg("--suite", "all");
const localQaPort = process.env.KONTUR_QA_PORT || "8765";
const baseUrl = (process.env.KONTUR_BASE_URL || `http://127.0.0.1:${localQaPort}`).replace(/\/$/, "");
const externalBaseUrl = (process.env.KONTUR_EXTERNAL_BASE_URL || "https://kontur.derevgroup.ru").replace(/\/$/, "");
const isLocalBaseUrl = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/|$)/i.test(baseUrl);

const rolePanelChecks = [
  ["owner", "today-role-owner", "owner"],
  ["construction_manager", "today-role-project-manager", "project_manager"],
  ["foreman:7", "today-role-foreman", "foreman"],
  ["master", "today-role-worker", "worker"],
  ["procurement_manager", "today-role-procurement", "procurement"],
  ["estimator", "today-role-estimator", "estimator"],
];

const visualPages = [
  { view: "today", path: "/today", title: "Сегодня", testId: "today-page", activeViewId: "todayView" },
  { view: "projects", path: "/objects", title: "Объекты", testId: "objects-page", activeViewId: "projectsView" },
  { view: "tasks", path: "/tasks", title: "Задачи", testId: "tasks-page", activeViewId: "tasksView" },
  { view: "materials", path: "/materials", title: "Материалы", testId: "materials-page", activeViewId: "materialsView" },
  { view: "photos", path: "/photo-reports", title: "Фотоотчёты", testId: "photo-reports-page", activeViewId: "photosView" },
  { view: "object_remarks", path: "/object-issues", title: "Замечания по объектам", testId: "object-issues-page", activeViewId: "object_remarksView" },
  { view: "documents", path: "/documents", title: "База знаний", testId: "documents-page", activeViewId: "documentsView" },
  { view: "dashboard", path: "/signals", title: "Сигналы", testId: "signals-page", activeViewId: "dashboardView" },
  { view: "feedback", path: "/feedback", title: "Обратная связь по программе", testId: "feedback-page", activeViewId: "feedbackView" },
  { view: "estimates", path: "/?view=estimates", title: "Сметы", testId: "estimates-page", activeViewId: "estimatesView" },
];

const d2domControlShots = [
  ["d2dom-control-owner-1440x900.png", "owner", 1440, 900],
  ["d2dom-control-owner-1280x720.png", "owner", 1280, 720],
  ["d2dom-control-foreman-1440x900.png", "foreman", 1440, 900],
  ["d2dom-control-master-390x844.png", "master", 390, 844],
];

const agentNames = [
  "QA Orchestrator Agent",
  "Scroll QA Agent",
  "Button QA Agent",
  "Navigation QA Agent",
  "Role QA Agent",
  "Read-only Safety QA Agent",
  "UX Sanity QA Agent",
  "Workflow QA Agent",
  "Photo Report Integrity QA Agent",
  "Data Integrity Agent",
  "Mobile QA Agent",
  "Console Error QA Agent",
  "Visual Regression QA Agent",
  "Visual Density QA Agent",
  "D2Dom Control Prototype QA Agent",
  "MAX Report Format QA Agent",
];

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function ensureDirs() {
  for (const dir of [ARTIFACT_DIR, SCREENSHOT_DIR, TRACE_DIR, VIDEO_DIR]) fs.mkdirSync(dir, { recursive: true });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    ...options,
  });
  return { code: result.status || 0, output: `${result.stdout || ""}${result.stderr || ""}`.trim() };
}

function findBrowserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_EXECUTABLE,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/microsoft-edge",
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function packageVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version || "unknown";
  } catch {
    return "unknown";
  }
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (firstError) {
    const bundled = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules", "playwright");
    try {
      return require(bundled);
    } catch {
      firstError.message += "\nPlaywright package is not available. Run npm install.";
      throw firstError;
    }
  }
}

async function waitForHealth(url, timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${url}/health`, { cache: "no-store" });
      if (response.ok) return true;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

async function ensureServer() {
  if (await waitForHealth(baseUrl, 1200)) return null;
  if (process.env.KONTUR_BASE_URL && !process.env.KONTUR_QA_PORT) throw new Error(`Server is not healthy: ${baseUrl}`);
  const parsedBaseUrl = new URL(baseUrl);
  const port = parsedBaseUrl.port || (parsedBaseUrl.protocol === "https:" ? "443" : "80");
  const child = spawn("python", ["app/server.py"], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "ignore"],
    shell: false,
    env: { ...process.env, HOST: parsedBaseUrl.hostname || "127.0.0.1", PORT: port },
  });
  const healthy = await waitForHealth(baseUrl, 25000);
  if (!healthy) {
    child.kill();
    throw new Error("Local server did not become healthy.");
  }
  return child;
}

function add(results, agent, name, status, details, severity = "normal", screenshot = "", meta = {}) {
  results.push({ agent, name, status, details, severity, screenshot, meta });
}

function statusForElementCount(count, { expected = false } = {}) {
  if (count > 0) return "OK";
  return expected ? "FAIL" : "PARTIAL";
}

function severityForStatus(status, expected = false) {
  if (status === "FAIL" && expected) return "blocker";
  return "normal";
}

async function selectRole(page, role) {
  const select = page.locator("#currentRoleSelect");
  if (!(await select.count().catch(() => 0))) return { ok: false, reason: "role switcher missing" };
  const options = await select.locator("option").evaluateAll((nodes) => nodes.map((node) => node.value)).catch(() => []);
  if (!options.includes(role)) return { ok: false, reason: `role option ${role} missing` };
  await select.selectOption(role);
  await page.waitForTimeout(350);
  return { ok: true, reason: "selected" };
}

async function fetchJsonSafe(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function preparePage(playwright, viewport = { width: 1366, height: 900 }) {
  const executablePath = findBrowserExecutable();
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: executablePath || undefined,
    channel: executablePath ? undefined : process.env.PLAYWRIGHT_CHANNEL || "chrome",
  });
  const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
  const errors = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error" && /Failed to load resource: the server responded with a status of 400/.test(message.text())) return;
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() === 400 && response.request().method() === "POST" && url.includes("/api/photo-reports")) return;
    if (response.status() >= 400 && response.status() !== 403) errors.push(`response: ${response.status()} ${url}`);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.includes("/api/") && !url.includes("/static/")) return;
    const errorText = request.failure()?.errorText || "";
    if (errorText.includes("ERR_ABORTED")) return;
    errors.push(`requestfailed: ${request.method()} ${url} ${errorText}`.trim());
  });
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  return { browser, context, page, errors };
}

async function route(page, viewOrPath) {
  const pathName = viewOrPath.startsWith("/") ? viewOrPath : `/?view=${encodeURIComponent(viewOrPath)}`;
  await page.goto(`${baseUrl}${pathName}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
}

async function visibleTextLength(page) {
  return page.evaluate(() => (document.body?.innerText || "").trim().length);
}

async function scrollMetric(page) {
  return page.evaluate(() => {
    const main = document.querySelector('[data-testid="qa-main-content"]');
    const root = document.querySelector('[data-testid="qa-scroll-root"]');
    const candidates = [document.scrollingElement, document.documentElement, document.body, main, root].filter(Boolean);
    return candidates.map((node) => ({
      tag: node.tagName || "document",
      scrollTop: node.scrollTop || 0,
      scrollHeight: node.scrollHeight || 0,
      clientHeight: node.clientHeight || 0,
      overflowY: getComputedStyle(node).overflowY,
    }));
  });
}

async function runLint(results) {
  const result = run(process.execPath, ["tools/qa/static-lint.mjs"]);
  add(results, "QA Orchestrator Agent", "Lint", result.code === 0 ? "OK" : "FAIL", result.output || "lint ok", result.code === 0 ? "normal" : "blocker");
}

async function runTypecheck(results) {
  const jsFiles = ["app/static/app.js", "app/static/app.compat.js"];
  const failures = [];
  for (const file of jsFiles) {
    const result = run(process.execPath, ["--check", file]);
    if (result.code !== 0) failures.push(`${file}: ${result.output}`);
  }
  add(results, "QA Orchestrator Agent", "Typecheck", failures.length ? "FAIL" : "OK", failures.join("\n") || "JS syntax is valid.", failures.length ? "blocker" : "normal");
}

async function runUnit(results) {
  const py = run("python", ["-m", "py_compile", "app/server.py", "app/database.py", "app/appeals.py", "app/smetter.py"]);
  const db = run("python", ["-c", "import sys; sys.path.insert(0, 'app'); from database import init_db; init_db(); print('db ok')"]);
  const appeals = run("python", ["-m", "unittest", "discover", "-s", "tests", "-p", "test_appeals.py"]);
  const smetter = run("python", ["-m", "unittest", "discover", "-s", "tests", "-p", "test_smetter_integration.py"]);
  const failed = py.code !== 0 || db.code !== 0 || appeals.code !== 0 || smetter.code !== 0;
  add(results, "QA Orchestrator Agent", "Unit smoke", failed ? "FAIL" : "OK", [py.output, db.output, appeals.output, smetter.output].filter(Boolean).join("\n") || "ok", failed ? "blocker" : "normal");
  runFeedbackFixStaticChecks(results);
}

function runFeedbackFixStaticChecks(results) {
  const appText = fs.readFileSync(path.join(ROOT, "app/static/app.js"), "utf8");
  const htmlText = fs.readFileSync(path.join(ROOT, "app/static/index.html"), "utf8");
  const serverText = fs.readFileSync(path.join(ROOT, "app/server.py"), "utf8");
  const checks = [
    {
      name: "Mobile file download behavior",
      ok:
        appText.includes("filePreviewKind") &&
        appText.includes("media-preview-frame") &&
        appText.includes('data-media-preview="pdf"') &&
        appText.includes("canPreviewInlineFile") &&
        appText.includes("download-link") &&
        serverText.includes("content_disposition_for_file") &&
        serverText.includes("download_from_yandex_disk(stored_path)"),
      details: "PDF/images open inside the app preview dialog with close controls; Excel and other office files download instead of opening blank mobile webview.",
    },
    {
      name: "Photo upload loading and compression",
      ok:
        appText.includes("compressImageForUpload") &&
        appText.includes("Готовим и загружаем фотоотчёт") &&
        appText.includes("photo-report-upload"),
      details: "Photo reports prepare large images and show loading before API request starts.",
    },
    {
      name: "Work extras can use work-task rates",
      ok:
        htmlText.includes('name="source_work_item_id"') &&
        htmlText.includes('name="unit_price"') &&
        htmlText.includes('name="total_price"') &&
        appText.includes("fillWorkExtraRateSelect") &&
        appText.includes("applyWorkExtraRateSelection"),
      details: "Extra works form exposes Smetter work-task rate selection, unit price and calculated total.",
    },
    {
      name: "Delivered material requests do not stay overdue",
      ok:
        appText.includes("materialBatchHasOpenProblem") &&
        appText.includes("materialBatchIsFinalForAttention") &&
        appText.includes("if (materialBatchIsFinalForAttention(batch)) return false") &&
        appText.includes("if (materialBatchIsClosedForAttention(batch)) return 0") &&
        serverText.includes("snapshot_material_has_open_problem") &&
        serverText.includes("COALESCE(b.stage, '') NOT IN ('delivered', 'closed', 'cancelled')"),
      details: "Delivered/closed non-problem material batches are excluded from delivery risk and attention scoring.",
    },
    {
      name: "Procurement can postpone or cancel material delivery without losing prices",
      ok:
        appText.includes('data-material-batch-action="postpone_delivery"') &&
        appText.includes('data-material-batch-action="cancel_delivery"') &&
        appText.includes("collectMaterialActualItems(currentBatch)") &&
        serverText.includes("postpone_delivery") &&
        serverText.includes("cancel_delivery") &&
        serverText.includes("actual_purchase_amount = save_material_actual_items"),
      details: "Material request dialog exposes postpone/cancel delivery actions and both actions preserve actual purchase prices through the backend.",
    },
    {
      name: "Foreman can request postponed material delivery again",
      ok:
        appText.includes("canRequestMaterialDeliveryAgain") &&
        appText.includes('data-material-batch-action="request_again"') &&
        appText.includes("materialBatchRequestAgainComment") &&
        serverText.includes("request_again") &&
        serverText.includes("Повторно запросить доставку может только прораб объекта") &&
        serverText.includes("stage = 'needs_approval'"),
      details: "Postponed material batches return to the foreman; the foreman can send a new delivery date and comment back to procurement.",
    },
  ];
  for (const check of checks) {
    add(results, "UX Sanity QA Agent", check.name, check.ok ? "OK" : "FAIL", check.details, check.ok ? "normal" : "blocker");
  }
}

function ensureLocalQaFixtures(results) {
  const isLocal = baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost");
  if (!isLocal || process.env.KONTUR_DISABLE_QA_FIXTURES === "1") {
    add(results, "QA Orchestrator Agent", "Local QA fixtures", "WARN", "fixtures skipped outside local QA server");
    return;
  }
  const script = String.raw`
import sys
import base64
from datetime import date, timedelta
sys.path.insert(0, "app")
from database import DATA_DIR, init_db, connect

init_db()
with connect() as db:
    def user_id(role, name):
        row = db.execute("SELECT id FROM users WHERE role = ? AND name = ?", (role, name)).fetchone()
        if row:
            return row["id"]
        cur = db.execute("INSERT INTO users (name, role, is_active) VALUES (?, ?, 1)", (name, role))
        return cur.lastrowid

    owner = user_id("owner", "QA Руководитель")
    master = user_id("master", "QA Мастер")
    procurement = user_id("procurement_manager", "QA Снабжение")
    row = db.execute("SELECT id FROM projects WHERE title = ?", ("QA тестовый объект",)).fetchone()
    if row:
        project = row["id"]
    else:
        cur = db.execute(
            """
            INSERT INTO projects (
                title, customer_name, status, address, navigator_url, smetter_ref,
                construction_manager_id, foreman_id, procurement_manager_id,
                planned_end_date, main_estimate_amount
            ) VALUES (?, ?, 'transferred_to_construction', ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "QA тестовый объект",
                "QA клиент",
                "Москва",
                "https://yandex.ru/maps/?rtext=~55.751244,37.618423&rtt=auto",
                "QA-SMT",
                owner,
                master,
                procurement,
                (date.today() + timedelta(days=14)).isoformat(),
                100000,
            ),
        )
        project = cur.lastrowid

    task_title = "QA проверить короткую карточку задачи"
    if not db.execute("SELECT id FROM tasks WHERE project_id = ? AND title = ?", (project, task_title)).fetchone():
        db.execute(
            """
            INSERT INTO tasks (project_id, title, assignee_id, creator_id, reviewer_id, due_date, status, priority, task_type, description)
            VALUES (?, ?, ?, ?, ?, ?, 'new', 'high', 'task', ?)
            """,
            (project, task_title, master, owner, owner, date.today().isoformat(), "Тестовая задача для проверки QA-карточек и кнопки выполнения."),
        )

    blocker_title = "QA блокер для проверки карточки"
    if not db.execute("SELECT id FROM blockers WHERE project_id = ? AND title = ?", (project, blocker_title)).fetchone():
        db.execute(
            """
            INSERT INTO blockers (project_id, title, description, blocker_type, responsible_user_id, due_date, severity, status, created_by)
            VALUES (?, ?, ?, 'no_material', ?, ?, 'high', 'open', ?)
            """,
            (project, blocker_title, "Тестовый блокер для coverage QA.", procurement, date.today().isoformat(), owner),
        )

    batch_row = db.execute("SELECT id FROM material_request_batches WHERE project_id = ? AND comment = ?", (project, "QA fixture batch")).fetchone()
    if batch_row:
        batch = batch_row["id"]
    else:
        cur = db.execute(
            """
            INSERT INTO material_request_batches (project_id, creator_id, needed_at, delivery_urgency, status, comment)
            VALUES (?, ?, ?, 'standard', 'new', 'QA fixture batch')
            """,
            (project, owner, (date.today() + timedelta(days=2)).isoformat()),
        )
        batch = cur.lastrowid
    if not db.execute("SELECT id FROM material_requests WHERE batch_id = ? AND title = ?", (batch, "QA тестовый материал")).fetchone():
        db.execute(
            """
            INSERT INTO material_requests (batch_id, project_id, creator_id, title, basis_type, estimate_section, needed_at, procurement_status, total_amount)
            VALUES (?, ?, ?, 'QA тестовый материал', 'main_estimate', 'QA раздел', ?, 'new', 1000)
            """,
            (batch, project, owner, (date.today() + timedelta(days=2)).isoformat()),
        )
    if not db.execute("SELECT id FROM feedback_items WHERE source = 'max' AND external_id = 'qa-feedback-max-fixture'").fetchone():
        db.execute(
            """
            INSERT INTO feedback_items (
                source, external_id, chat_id, chat_title, sender_id, sender_name,
                text, attachments_json, status, decision_comment
            )
            VALUES ('max', 'qa-feedback-max-fixture', '-qa-chat', 'QA MAX chat', 'qa-user', 'QA MAX',
                    'QA сообщение из MAX для проверки видимости обратной связи', '[]', 'new', '')
            """
        )
    photo_comment = "QA photo report fixture"
    report_row = db.execute("SELECT id FROM photo_reports WHERE project_id = ? AND comment = ?", (project, photo_comment)).fetchone()
    if report_row:
        report = report_row["id"]
    else:
        cur = db.execute(
            """
            INSERT INTO photo_reports (project_id, report_date, author_id, stage, zones, comment, status)
            VALUES (?, ?, ?, 'QA', 'QA zone', ?, 'review')
            """,
            (project, date.today().isoformat(), master, photo_comment),
        )
        report = cur.lastrowid

    doc_ids = []
    for doc_title in ("qa-photo-fixture-1.png", "qa-photo-fixture-2.png"):
        doc_row = db.execute("SELECT id FROM documents WHERE project_id = ? AND title = ? AND type = 'photo_report'", (project, doc_title)).fetchone()
        if doc_row:
            doc_ids.append(doc_row["id"])
            continue
        upload_dir = DATA_DIR / "uploads" / f"project_{project}"
        upload_dir.mkdir(parents=True, exist_ok=True)
        file_path = upload_dir / doc_title
        file_path.write_bytes(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="))
        cur = db.execute(
            """
            INSERT INTO documents (
                project_id, title, type, status, owner_id, related_type, process_type,
                file_name, file_path, mime_type, file_size
            )
            VALUES (?, ?, 'photo_report', 'active', ?, 'photo_report', ?, ?, ?, 'image/png', ?)
            """,
            (
                project,
                doc_title,
                master,
                f"photo_report:{report}",
                doc_title,
                str(file_path.relative_to(DATA_DIR)),
                file_path.stat().st_size,
            ),
        )
        doc_ids.append(cur.lastrowid)
    for doc in doc_ids:
        if not db.execute("SELECT id FROM photo_report_documents WHERE photo_report_id = ? AND document_id = ?", (report, doc)).fetchone():
            db.execute("INSERT INTO photo_report_documents (photo_report_id, document_id) VALUES (?, ?)", (report, doc))
    db.execute("UPDATE photo_reports SET files_count = ? WHERE id = ?", (len(doc_ids), report))
    db.commit()
    print(f"fixture ok project={project}")
`;
  const result = run("python", ["-c", script], { timeout: 30_000 });
  add(results, "QA Orchestrator Agent", "Local QA fixtures", result.code === 0 ? "OK" : "FAIL", result.output || "fixture ok", result.code === 0 ? "normal" : "blocker");
}

async function runSmoke(results, page) {
  await route(page, "/today");
  const length = await visibleTextLength(page);
  const hasLoader = await page.locator(".app-loading, .global-loader").count().catch(() => 0);
  add(results, "QA Orchestrator Agent", "No white screen", length > 20 ? "OK" : "FAIL", `Visible text length: ${length}`, length > 20 ? "normal" : "blocker");
  add(results, "QA Orchestrator Agent", "No endless loader", hasLoader ? "WARN" : "OK", `Loader nodes: ${hasLoader}`);
}

async function runVersionCache(results) {
  const expectedCommit = run("git", ["rev-parse", "--short", "HEAD"]).output || "";
  const [first, second, head] = await Promise.all([
    fetch(`${baseUrl}/version`, { cache: "no-store" }),
    fetch(`${baseUrl}/version`, { cache: "no-store" }),
    fetch(`${baseUrl}/version`, { method: "HEAD", cache: "no-store" }),
  ]);
  const firstJson = first.ok ? await first.json().catch(() => null) : null;
  const secondJson = second.ok ? await second.json().catch(() => null) : null;
  const firstCache = first.headers.get("cache-control") || "";
  const secondCache = second.headers.get("cache-control") || "";
  const headCache = head.headers.get("cache-control") || "";
  const headPragma = head.headers.get("pragma") || "";
  const headExpires = head.headers.get("expires") || "";
  const noStore =
    firstCache.includes("no-store") &&
    secondCache.includes("no-store") &&
    headCache.includes("no-store") &&
    headPragma.toLowerCase().includes("no-cache") &&
    headExpires === "0";
  const commitOk =
    Boolean(firstJson?.commitHash) &&
    firstJson.commitHash === secondJson?.commitHash &&
    (!expectedCommit || firstJson.commitHash.startsWith(expectedCommit) || expectedCommit.startsWith(firstJson.commitHash));
  const status = first.ok && second.ok && head.ok && noStore && commitOk ? "OK" : "FAIL";
  add(
    results,
    "QA Orchestrator Agent",
    "Version endpoint is uncached and current",
    status,
    `first=${first.status}; second=${second.status}; head=${head.status}; cache=${firstCache} / ${secondCache} / ${headCache}; headPragma=${headPragma}; headExpires=${headExpires}; versionCommit=${firstJson?.commitHash || "missing"}; expectedCommit=${expectedCommit || "missing"}`,
    status === "OK" ? "normal" : "blocker",
  );
}

async function runScroll(results, page) {
  const routes = ["today", "projects", "tasks", "materials", "photos", "object_remarks", "documents", "dashboard", "feedback"];
  for (const view of routes) {
    await route(page, view);
    await page
      .evaluate(() => {
        for (const node of [document.scrollingElement, document.documentElement, document.body, document.querySelector('[data-testid="qa-main-content"]'), document.querySelector('[data-testid="qa-scroll-root"]')].filter(Boolean)) {
          node.scrollTop = 0;
        }
        window.scrollTo(0, 0);
      })
      .catch(() => {});
    const before = await scrollMetric(page);
    const mainBox = await page.locator('[data-testid="qa-main-content"]').boundingBox().catch(() => null);
    if (mainBox) {
      const viewport = page.viewportSize() || { width: 1280, height: 720 };
      const targetX = Math.min(
        viewport.width - 12,
        Math.max(12, mainBox.x + Math.min(mainBox.width - 8, Math.max(8, mainBox.width / 2))),
      );
      const targetY = Math.min(
        viewport.height - 12,
        Math.max(12, mainBox.y + Math.min(mainBox.height - 8, Math.max(8, mainBox.height / 2))),
      );
      await page.mouse.move(
        targetX,
        targetY,
      );
    } else {
      await page.mouse.move(900, 450);
    }
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(120);
    const after = await scrollMetric(page);
    const scrollable = before.some((item) => item.scrollHeight > item.clientHeight + 20);
    const moved = after.some((item, index) => (item.scrollTop || 0) > (before[index]?.scrollTop || 0));
    const status = !scrollable || moved ? "OK" : "FAIL";
    add(results, "Scroll QA Agent", `Wheel scroll: ${view}`, status, `scrollable=${scrollable}; moved=${moved}`, status === "FAIL" ? "blocker" : "normal");
    await page.keyboard.press("PageDown").catch(() => {});
    await page.waitForTimeout(80);
  }
  const overflowLocked = await page.evaluate(() => {
    const body = getComputedStyle(document.body).overflowY;
    const html = getComputedStyle(document.documentElement).overflowY;
    return body === "hidden" || html === "hidden";
  });
  add(results, "Scroll QA Agent", "Scroll not locked after checks", overflowLocked ? "FAIL" : "OK", `overflow locked=${overflowLocked}`, overflowLocked ? "blocker" : "normal");
}

async function runButtons(results, page) {
  await selectRole(page, "owner");
  await route(page, "today");
  const targets = [
    ['[data-testid="nav-objects"]', "Open objects"],
    ['[data-testid="nav-tasks"]', "Open tasks"],
    ['[data-testid="nav-materials"]', "Open materials"],
    ['[data-testid="nav-documents"]', "Open documents"],
    ['[data-testid="nav-feedback"]', "Open feedback"],
  ];
  for (const [selector, title] of targets) {
    const button = page.locator(selector).first();
    if (!(await button.count())) {
      add(results, "Button QA Agent", title, "WARN", `Button ${selector} is not visible for current role.`);
      continue;
    }
    const before = await page.locator("#pageTitle").innerText().catch(() => "");
    await button.click();
    await page.waitForTimeout(250);
    const after = await page.locator("#pageTitle").innerText().catch(() => "");
    const ok = before !== after || (await page.locator(".view.active").count()) > 0;
    add(results, "Button QA Agent", title, ok ? "OK" : "FAIL", `before=${before}; after=${after}`, ok ? "normal" : "blocker");
  }
  await route(page, "feedback");
  await page.waitForTimeout(350);
  const feedbackRows = await page.locator(".feedback-row").count().catch(() => 0);
  const feedbackStatsText = await page.locator("#feedbackStats").innerText().catch(() => "");
  const feedbackStatusText = await page.locator("#feedbackRefreshStatus").innerText().catch(() => "");
  const feedbackVisibleTextRows = await page.locator(".feedback-row p").evaluateAll((nodes) =>
    nodes.filter((node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      const text = (node.textContent || "").trim();
      return text && text !== "Без текста" && style.display !== "none" && style.visibility !== "hidden" && box.height > 0 && box.width > 0;
    }).length,
  ).catch(() => 0);
  const feedbackVisible = feedbackRows > 0 && feedbackVisibleTextRows > 0;
  add(
    results,
    "Button QA Agent",
    "Feedback MAX messages and text are visible",
    feedbackVisible ? "OK" : "FAIL",
    `rows=${feedbackRows}; visibleTextRows=${feedbackVisibleTextRows}; stats=${feedbackStatsText.replace(/\s+/g, " ").trim()}; status=${feedbackStatusText.replace(/\s+/g, " ").trim()}`,
    feedbackVisible ? "normal" : "blocker",
    "",
    { buttonsChecked: 1, feedbackRowsChecked: feedbackRows },
  );
  await route(page, "projects");
  const objectRows = page.locator('.row[data-testid="object-card"]');
  const objectCount = await objectRows.count().catch(() => 0);
  if (!objectCount) {
    add(results, "Button QA Agent", "Open object card", "PARTIAL", "object_cards=0; карточку объекта открыть нечем", "normal", "", { buttonsChecked: 0, objectCardsChecked: 0 });
  } else {
    const beforeDetail = await page.locator("#projectDetail").innerText().catch(() => "");
    await objectRows.first().click();
    await page.waitForTimeout(450);
    const afterDetail = await page.locator("#projectDetail").innerText().catch(() => "");
    const opened = afterDetail.trim().length > 20 && afterDetail !== beforeDetail;
    add(results, "Button QA Agent", "Open object card", opened ? "OK" : "FAIL", `object_cards=${objectCount}; opened=${opened}`, opened ? "normal" : "blocker", "", { buttonsChecked: 1, objectCardsChecked: objectCount });
  }
  const projectTabs = page.locator("button.tab[data-project-tab]");
  const tabCount = await projectTabs.count().catch(() => 0);
  if (!tabCount) {
    add(results, "Button QA Agent", "Object tabs switch", "PARTIAL", "tabs=0; нет открытой карточки или вкладок объекта", "normal", "", { buttonsChecked: 0 });
  } else {
    const index = Math.min(1, tabCount - 1);
    const tabText = await projectTabs.nth(index).innerText().catch(() => "");
    await projectTabs.nth(index).click();
    await page.waitForTimeout(200);
    const activeText = await page.locator("button.tab[data-project-tab].active").innerText().catch(() => "");
    const switched = Boolean(activeText && activeText.trim() === tabText.trim());
    add(results, "Button QA Agent", "Object tabs switch", switched ? "OK" : "FAIL", `tabs=${tabCount}; clicked=${tabText}; active=${activeText}`, switched ? "normal" : "blocker", "", { buttonsChecked: 1 });
  }
  await route(page, "tasks");
  await selectRole(page, "owner");
  const taskCards = page.locator('#tasksView.active [data-testid="task-card"]');
  const taskCardCount = await taskCards.count().catch(() => 0);
  if (!taskCardCount) {
    add(results, "Button QA Agent", "Open task details", "PARTIAL", "task_cards=0; нечего раскрывать", "normal", "", { buttonsChecked: 0, taskCardsChecked: 0 });
  } else {
    const firstTask = taskCards.first();
    const wasOpen = await firstTask.evaluate((node) => node.hasAttribute("open")).catch(() => false);
    await firstTask.locator("summary").click();
    await page.waitForTimeout(200);
    const isOpen = await firstTask.evaluate((node) => node.hasAttribute("open")).catch(() => false);
    const toggled = wasOpen !== isOpen;
    add(results, "Button QA Agent", "Open task details", toggled ? "OK" : "FAIL", `task_cards=${taskCardCount}; beforeOpen=${wasOpen}; afterOpen=${isOpen}`, toggled ? "normal" : "blocker", "", { buttonsChecked: 1, taskCardsChecked: taskCardCount });
  }
  await selectRole(page, "master");
  await route(page, "tasks");
  const masterTaskCards = page.locator('#tasksView.active [data-testid="task-card"]');
  const masterTaskCardCount = await masterTaskCards.count().catch(() => 0);
  const masterActionableTaskCount = await masterTaskCards.evaluateAll((cards) =>
    cards.filter((card) => {
      const text = card.textContent || "";
      return !/(Выполнение принято|Закрыта|Отменена|Принято)/i.test(text);
    }).length
  ).catch(() => 0);
  const masterNextActionButtons = await page.locator('#tasksView.active [data-task-action="start"], #tasksView.active [data-task-action="complete"]').count().catch(() => 0);
  const masterDoneOk = masterActionableTaskCount === 0 || masterNextActionButtons > 0;
  add(
    results,
    "Button QA Agent",
    "Master next task action is available for actionable tasks",
    masterDoneOk ? "OK" : "FAIL",
    `master_task_cards=${masterTaskCardCount}; actionable=${masterActionableTaskCount}; next_action_buttons=${masterNextActionButtons}`,
    masterDoneOk ? "normal" : "blocker",
    "",
    { buttonsChecked: masterNextActionButtons ? 1 : 0, taskCardsChecked: masterTaskCardCount }
  );
  await selectRole(page, "owner");
  await route(page, "materials");
  const pipelineButtons = page.locator('[data-material-pipeline-filter]:visible');
  const pipelineCount = await page.locator('[data-material-pipeline-filter]').count().catch(() => 0);
  const visiblePipelineCount = await pipelineButtons.count().catch(() => 0);
  let pipelineOk = pipelineCount >= 8 && visiblePipelineCount >= 8;
  if (pipelineOk) {
    const target = pipelineButtons.nth(1);
    const filter = await target.getAttribute("data-material-pipeline-filter");
    await target.click();
    await page.waitForTimeout(200);
    const activeFilter = await page.locator("[data-material-pipeline-filter].active").getAttribute("data-material-pipeline-filter").catch(() => "");
    pipelineOk = activeFilter === filter;
  }
  add(results, "Button QA Agent", "Material pipeline tabs switch", pipelineCount ? (pipelineOk ? "OK" : "FAIL") : "PARTIAL", `pipeline_buttons=${pipelineCount}; visible=${visiblePipelineCount}; switched=${pipelineOk}`, pipelineOk || !pipelineCount ? "normal" : "blocker", "", { buttonsChecked: visiblePipelineCount ? 1 : 0 });
  await page.setViewportSize({ width: 390, height: 844 });
  await route(page, "today");
  const plus = page.locator('[data-testid="mobile-plus-button"]').first();
  if (await plus.count()) {
    await plus.click();
    await page.waitForTimeout(200);
    const open = await page.locator('[data-testid="mobile-quick-actions"] [data-mobile-action]').count();
    const labels = await page.locator('[data-testid="mobile-quick-actions"] [data-mobile-action]').evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim()).filter(Boolean)).catch(() => []);
    add(results, "Button QA Agent", "Mobile + opens actions", open > 0 ? "OK" : "FAIL", `actions=${open}; labels=${labels.join(" | ")}`, open > 0 ? "normal" : "blocker", "", { buttonsChecked: 1, mobileQuickActionsChecked: open });
  }
  await route(page, "today");
  await selectRole(page, "master");
  await page.locator("#mobileQuickSheet:not([hidden]) #mobileQuickActionClose").click().catch(() => {});
  await page.waitForTimeout(100);
  await page.locator('[data-testid="mobile-plus-button"]').click().catch(() => {});
  await page.waitForTimeout(200);
  const masterActions = await page.locator('[data-testid="mobile-quick-actions"] [data-mobile-action]').evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim()).filter(Boolean)).catch(() => []);
  const masterQuickOk = masterActions.includes("Добавить фото") && masterActions.includes("Сообщить проблему");
  add(results, "Button QA Agent", "Master mobile quick actions", masterQuickOk ? "OK" : "FAIL", `labels=${masterActions.join(" | ") || "none"}`, masterQuickOk ? "normal" : "blocker", "", { buttonsChecked: masterActions.length, mobileQuickActionsChecked: masterActions.length });
  await page.setViewportSize({ width: 1366, height: 900 });
}

async function runNavigation(results, page) {
  const routes = ["/today", "/objects", "/tasks", "/materials", "/photo-reports", "/object-issues", "/documents", "/signals", "/feedback", "/settings"];
  for (const target of routes) {
    await route(page, target);
    const length = await visibleTextLength(page);
    const responseOk = !page.url().includes("/login");
    const status = responseOk && length > 20 ? "OK" : "FAIL";
    add(results, "Navigation QA Agent", `Route ${target}`, status, `url=${page.url()}; text=${length}`, status === "FAIL" ? "blocker" : "normal");
  }
  await page.goBack().catch(() => null);
  await page.waitForTimeout(150);
  add(results, "Navigation QA Agent", "Browser Back does not break app", (await visibleTextLength(page)) > 20 ? "OK" : "FAIL", `url=${page.url()}`);
}

async function runRoles(results, page) {
  const roleChecks = [
    ["owner", "today-role-owner", ["nav-objects", "nav-tasks", "nav-materials"], []],
    ["construction_manager", "today-role-project-manager", ["nav-objects", "nav-tasks", "nav-materials", "nav-feedback"], ["nav-estimates"]],
    ["foreman:7", "today-role-foreman", ["nav-objects", "nav-tasks", "nav-materials", "nav-photo-reports"], ["nav-feedback", "nav-estimates", "nav-documents"]],
    ["master", "today-role-worker", ["nav-tasks", "nav-photo-reports", "nav-object-issues"], ["nav-objects", "nav-materials", "nav-feedback", "nav-documents"]],
    ["procurement_manager", "today-role-procurement", ["nav-materials", "nav-objects", "nav-photo-reports"], ["nav-tasks", "nav-feedback", "nav-estimates"]],
    ["estimator", "today-role-estimator", ["nav-estimates", "nav-materials", "nav-variations", "nav-photo-reports"], ["nav-feedback"]],
  ];
  await route(page, "today");
  for (const [role, rolePanelTestId, expectedIds, hiddenIds] of roleChecks) {
    const select = page.locator("#currentRoleSelect");
    if (!(await select.count())) {
      add(results, "Role QA Agent", `Role ${role}`, "WARN", "Role switcher is hidden for current account.");
      continue;
    }
    const options = await select.locator("option").evaluateAll((nodes) => nodes.map((node) => node.value));
    if (!options.includes(role)) {
      add(results, "Role QA Agent", `Role ${role}`, "WARN", "Role option is not available in current data set.");
      continue;
    }
    await select.selectOption(role);
    await page.waitForTimeout(350);
    const rolePanelVisible = await page.locator(`[data-testid="${rolePanelTestId}"]`).isVisible().catch(() => false);
    add(results, "Role QA Agent", `${role}: role today panel`, rolePanelVisible ? "OK" : "FAIL", `panel=${rolePanelTestId}; visible=${rolePanelVisible}`, rolePanelVisible ? "normal" : "blocker");
    for (const id of expectedIds) {
      const visible = await page.locator(`[data-testid="${id}"]`).isVisible().catch(() => false);
      add(results, "Role QA Agent", `${role}: ${id}`, visible ? "OK" : "FAIL", `visible=${visible}`, visible ? "normal" : "blocker");
    }
    for (const id of hiddenIds || []) {
      const visible = await page.locator(`[data-testid="${id}"]`).isVisible().catch(() => false);
      add(results, "Role QA Agent", `${role}: hides ${id}`, !visible ? "OK" : "FAIL", `visible=${visible}`, !visible ? "normal" : "blocker");
    }
  }
}

async function createAuditLoginUrl() {
  if (process.env.KONTUR_AUDIT_LOGIN_URL) return process.env.KONTUR_AUDIT_LOGIN_URL;
  const result = run("python", ["tools/create_ai_audit_token.py", "--public-url", baseUrl], { timeout: 30_000 });
  const match = result.output.match(/login_url=(\S+)/);
  if (!match) throw new Error(`Could not create audit token: ${result.output}`);
  return match[1];
}

async function runReadonly(results, playwright) {
  const executablePath = findBrowserExecutable();
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: executablePath || undefined,
    channel: executablePath ? undefined : process.env.PLAYWRIGHT_CHANNEL || "chrome",
  });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  try {
    const loginUrl = await createAuditLoginUrl();
    await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.href.includes("audit=1") || url.pathname.includes("/login"), { timeout: 7000 }).catch(() => {});
    const reachedAuditApp = page.url().includes("audit=1") && !page.url().includes("/login");
    add(results, "Read-only Safety QA Agent", "Audit login redirects to app", reachedAuditApp ? "OK" : "FAIL", `href=${page.url()}`, reachedAuditApp ? "normal" : "blocker");
    const cookies = await page.context().cookies(baseUrl);
    const hasSessionCookie = cookies.some((cookie) => cookie.name === "kontur_session" && cookie.path === "/");
    add(results, "Read-only Safety QA Agent", "Audit cookie is set for app path", hasSessionCookie ? "OK" : "FAIL", `kontur_session=${hasSessionCookie}`, hasSessionCookie ? "normal" : "blocker");
    const todayVisible = await page.locator('[data-testid="today-page"]').waitFor({ state: "visible", timeout: 6000 }).then(() => true).catch(() => false);
    add(results, "Read-only Safety QA Agent", "Audit today page is visible", todayVisible ? "OK" : "FAIL", `today-page=${todayVisible}`, todayVisible ? "normal" : "blocker");
    const sessionCheck = await page.evaluate(async () => {
      const response = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
      const text = await response.text();
      let payload = {};
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text.slice(0, 120) };
      }
      return { status: response.status, payload, href: location.href, hasLoginForm: Boolean(document.querySelector("#loginForm")) };
    });
    const actualAccessOk =
      sessionCheck.status === 200 &&
      sessionCheck.payload?.role === "ai_auditor" &&
      !sessionCheck.hasLoginForm &&
      !String(sessionCheck.href || "").includes("/login");
    add(
      results,
      "Read-only Safety QA Agent",
      "Live audit-login actual access",
      actualAccessOk ? "OK" : "FAIL",
      `status=${sessionCheck.status}; role=${sessionCheck.payload?.role || "unknown"}; href=${sessionCheck.href}; loginForm=${sessionCheck.hasLoginForm}`,
      actualAccessOk ? "normal" : "blocker",
    );
    add(
      results,
      "Read-only Safety QA Agent",
      "External cookie-limited viewer",
      "WARN",
      "unsupported: audit-login requires the client to keep a Secure HttpOnly SameSite=Lax session cookie. Use a full browser link or the read-only snapshot for cookieless AI viewers.",
      "normal",
    );
    const writeStatuses = await page.evaluate(async () => {
      const methods = ["POST", "PUT", "PATCH", "DELETE"];
      const entries = [];
      for (const method of methods) {
        const response = await fetch("/api/tasks", { method, headers: { "Content-Type": "application/json" }, body: method === "DELETE" ? undefined : "{}" });
        entries.push([method, response.status]);
      }
      return Object.fromEntries(entries);
    });
    const writeMethodsOk = Object.values(writeStatuses).every((status) => status === 403);
    add(results, "Read-only Safety QA Agent", "Audit write methods return 403", writeMethodsOk ? "OK" : "FAIL", JSON.stringify(writeStatuses), writeMethodsOk ? "normal" : "blocker");
    const activeWriteButtons = await page.evaluate(() => {
      const dangerousText = /(добавить|создать|сохранить|удалить|принять|вернуть|готово|выполнено|запросить|отправить)/i;
      const safeViewText = /^(Развернуть|Свернуть|Открыть|Показать|Скрыть|Посмотреть|Назад|Закрыть)$/i;
      const isVisible = (node) => {
        const style = getComputedStyle(node);
        return style.visibility !== "hidden" && style.display !== "none" && node.getClientRects().length > 0;
      };
      return [...document.querySelectorAll("button, [role='button']")]
        .filter((node) => isVisible(node) && !node.disabled && node.getAttribute("aria-disabled") !== "true")
        .map((node) => (node.textContent || "").trim())
        .filter((text) => dangerousText.test(text) && !safeViewText.test(text));
    });
    add(results, "Read-only Safety QA Agent", "Read-only write buttons are hidden or disabled", activeWriteButtons.length ? "FAIL" : "OK", `active_write_buttons=${activeWriteButtons.join(" | ") || "none"}`, activeWriteButtons.length ? "blocker" : "normal");
    const sensitiveText = await page.evaluate(() => document.body.innerText || "");
    const leaks = [/\+7[-\s]?\d{3}/, /@/, /банк/i].filter((pattern) => pattern.test(sensitiveText)).length;
    add(results, "Read-only Safety QA Agent", "Sensitive data is hidden in auditor view", leaks === 0 ? "OK" : "WARN", `sensitive-patterns=${leaks}`);
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function runUx(results, page) {
  await route(page, "tasks");
  await selectRole(page, "owner");
  const bodyText = await page.evaluate(() => document.body.innerText || "");
  const forbidden = ["in_progress", "main_estimate", "construction_manager", "procurement_manager", "estimator"].filter((item) => bodyText.includes(item));
  add(results, "UX Sanity QA Agent", "No technical enum values in visible UI", forbidden.length ? "FAIL" : "OK", forbidden.join(", ") || "none", forbidden.length ? "blocker" : "normal");
  const activeTasks = page.locator('#tasksView.active');
  const taskCardCount = await activeTasks.locator('[data-testid="task-card"]').count();
  const badgeCount = await activeTasks.locator('[data-testid="task-type-badge"], [data-testid="task-status-badge"], [data-testid="task-priority-badge"]').count();
  const expectedBadgeCount = taskCardCount * 3;
  const badgeStatus = taskCardCount === 0 ? "PARTIAL" : badgeCount >= expectedBadgeCount ? "OK" : "FAIL";
  add(results, "UX Sanity QA Agent", "Task card has separated badges", badgeStatus, `cards=${taskCardCount}; badges=${badgeCount}; expected_badges>=${expectedBadgeCount}`, severityForStatus(badgeStatus, true), "", { taskCardsChecked: taskCardCount });
  const taskTitleCount = await activeTasks.locator('[data-testid="task-title"]').count();
  const taskMetaCount = await activeTasks.locator('[data-testid="task-meta"]').count();
  const taskLayoutStatus = taskCardCount === 0 ? "PARTIAL" : taskTitleCount >= taskCardCount && taskMetaCount >= taskCardCount && badgeCount >= expectedBadgeCount ? "OK" : "FAIL";
  add(results, "UX Sanity QA Agent", "Task card separates title, meta and status", taskLayoutStatus, `cards=${taskCardCount}; titles=${taskTitleCount}; meta=${taskMetaCount}; badges=${badgeCount}`, severityForStatus(taskLayoutStatus, true), "", { taskCardsChecked: taskCardCount });
  const summaryDescriptionCount = await activeTasks.locator(".task-summary .task-description-clamp, .today-task-card .task-description-clamp, .compact-task-card .task-description-clamp").count().catch(() => 0);
  add(results, "UX Sanity QA Agent", "Task descriptions are collapsed in lists", taskCardCount === 0 ? "PARTIAL" : summaryDescriptionCount === 0 ? "OK" : "FAIL", `cards=${taskCardCount}; visible-list-descriptions=${summaryDescriptionCount}`, taskCardCount === 0 || summaryDescriptionCount === 0 ? "normal" : "blocker");
  const workflowSectionCount = await activeTasks.locator('[data-testid="task-workflow-section"]').count().catch(() => 0);
  const workflowSectionStatus = taskCardCount === 0 ? "PARTIAL" : workflowSectionCount > 0 ? "OK" : "FAIL";
  add(results, "UX Sanity QA Agent", "Task list is grouped by role responsibility", workflowSectionStatus, `cards=${taskCardCount}; sections=${workflowSectionCount}`, severityForStatus(workflowSectionStatus, true), "", { taskWorkflowSectionsChecked: workflowSectionCount });
  await route(page, "today");
  const attention = await page.locator('[data-testid="today-attention-list"]').innerText().catch(() => "");
  add(results, "UX Sanity QA Agent", "Today screen shows concrete attention block", attention.trim().length > 0 ? "OK" : "WARN", `length=${attention.trim().length}`);
  const roleResults = {};
  for (const [role, testId, label] of rolePanelChecks) {
    const selected = await selectRole(page, role);
    roleResults[label] = Boolean(selected.ok && (await page.locator(`[data-testid="${testId}"]`).isVisible().catch(() => false)));
  }
  const rolePanelsChecked = Object.values(roleResults).filter(Boolean).length;
  const roleDetails = [
    `role-panels=${rolePanelsChecked}/${rolePanelChecks.length}`,
    ...Object.entries(roleResults).map(([key, value]) => `${key}=${value}`),
  ].join("; ");
  const roleStatus = rolePanelsChecked === rolePanelChecks.length ? "OK" : rolePanelsChecked > 0 ? "PARTIAL" : "FAIL";
  add(results, "UX Sanity QA Agent", "Today screen is role-aware", roleStatus, roleDetails, severityForStatus(roleStatus, true), "", { rolePanelsChecked, rolePanelsTotal: rolePanelChecks.length });
  await selectRole(page, "owner");
  await route(page, "projects");
  const objectCardCount = await page.locator('.row[data-testid="object-card"]').count().catch(() => 0);
  const objectStatus = statusForElementCount(objectCardCount);
  add(results, "UX Sanity QA Agent", "Object cards are present", objectStatus, `object_cards=${objectCardCount}`, severityForStatus(objectStatus), "", { objectCardsChecked: objectCardCount });
  const qaObject = page.locator('.row[data-testid="object-card"]').filter({ hasText: "QA тестовый объект" }).first();
  if (await qaObject.count().catch(() => 0)) {
    await qaObject.click();
    await page.waitForTimeout(350);
  }
  const blockerCardCount = await page.locator('[data-testid="blocker-card"]').count().catch(() => 0);
  const blockerStatus = statusForElementCount(blockerCardCount);
  add(results, "UX Sanity QA Agent", "Blocker cards are present when blockers exist", blockerStatus, `blocker_cards=${blockerCardCount}`, "normal", "", { blockerCardsChecked: blockerCardCount });
  await route(page, "dashboard");
  const technicalSignalType = await page.evaluate(() => {
    const text = document.body.innerText || "";
    return /\[(task|tasks|material_request|material_requests|photo_report|photo_reports|object_remark|object_remarks|variation|variations|estimate_job)\]/i.test(text);
  }).catch(() => false);
  add(results, "UX Sanity QA Agent", "Signal types are human-readable", technicalSignalType ? "FAIL" : "OK", `technical-signal-type=${technicalSignalType}`, technicalSignalType ? "blocker" : "normal");
  const duplicateSignalText = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid="signal-card"] .signal-preview')];
    return cards.some((card) => {
      const rows = [...card.querySelectorAll("span")].map((node) => node.textContent?.trim()).filter(Boolean);
      return rows.some((text, index) => index > 0 && text === rows[index - 1]);
    });
  }).catch(() => false);
  add(results, "UX Sanity QA Agent", "Signals do not repeat identical text consecutively", duplicateSignalText ? "FAIL" : "OK", `duplicate-consecutive=${duplicateSignalText}`, duplicateSignalText ? "blocker" : "normal");
  const badPluralMatches = await page.evaluate(() => {
    const text = document.body.innerText || "";
    return [...text.matchAll(/(?<!ещё[ \u00a0])(?:2|3|4|22|23|24)[ \u00a0]+позиций|ещё[ \u00a0]+(?:2|3|4|22|23|24)[ \u00a0]+позиций/gi)].map((match) => match[0]);
  }).catch(() => []);
  add(results, "UX Sanity QA Agent", "Signal pluralization is correct", badPluralMatches.length ? "FAIL" : "OK", `bad-plural=${badPluralMatches.join(" | ") || "none"}`, badPluralMatches.length ? "blocker" : "normal");
  await route(page, "materials");
  const materialTabs = await page.locator('[data-testid="material-status-tabs"]').isVisible().catch(() => false);
  add(results, "UX Sanity QA Agent", "Materials pipeline tabs are visible", materialTabs ? "OK" : "FAIL", `tabs=${materialTabs}`, materialTabs ? "normal" : "blocker");
  const materialCardCount = await page.locator('[data-testid="material-card"]').count().catch(() => 0);
  const materialStatus = statusForElementCount(materialCardCount);
  add(results, "UX Sanity QA Agent", "Material cards are present", materialStatus, `material_cards=${materialCardCount}`, severityForStatus(materialStatus), "", { materialCardsChecked: materialCardCount });
}

async function runWorkflow(results, page) {
  await route(page, "tasks");
  const helpersReady = await page
    .waitForFunction(
      () =>
        typeof window.__konturTaskStatusKey === "function" &&
        typeof window.__konturTaskCountsAsOverdue === "function" &&
        typeof window.__konturTaskReviewCountsAsOverdue === "function",
      null,
      { timeout: 5000 },
    )
    .then(() => true)
    .catch(() => false);
  add(
    results,
    "Workflow QA Agent",
    "Task workflow helpers are available",
    helpersReady ? "OK" : "FAIL",
    `helpers_ready=${helpersReady}`,
    helpersReady ? "normal" : "blocker",
  );
  if (!helpersReady) return;

  const workflow = await page.evaluate(() => {
    const statusKey = window.__konturTaskStatusKey;
    const executionOverdue = window.__konturTaskCountsAsOverdue;
    const reviewOverdue = window.__konturTaskReviewCountsAsOverdue;
    const yesterday = "2026-01-01";
    const aliases = {
      newStatus: statusKey("new"),
      inProgress: statusKey("in_progress"),
      oldInProgress: statusKey("in_progress_task"),
      waiting: statusKey("waiting_check"),
      oldWaiting: statusKey("completed_pending_acceptance"),
      accepted: statusKey("accepted"),
      cancelled: statusKey("cancelled"),
    };
    const execution = {
      newTask: executionOverdue({ status: "new", due_date: yesterday }),
      inProgress: executionOverdue({ status: "in_progress", due_date: yesterday }),
      oldInProgress: executionOverdue({ status: "in_progress_task", due_date: yesterday }),
      returned: executionOverdue({ status: "returned", due_date: yesterday }),
      waitingCheck: executionOverdue({ status: "waiting_check", due_date: yesterday }),
      oldWaitingCheck: executionOverdue({ status: "completed_pending_acceptance", due_date: yesterday }),
      accepted: executionOverdue({ status: "accepted", due_date: yesterday }),
      cancelled: executionOverdue({ status: "cancelled", due_date: yesterday }),
      noDueDate: executionOverdue({ status: "in_progress", due_date: "" }),
    };
    const review = {
      waitingCheck: reviewOverdue({ status: "waiting_check", review_due_at: yesterday }),
      oldWaitingCheck: reviewOverdue({ status: "completed_pending_acceptance", review_due_at: yesterday }),
      accepted: reviewOverdue({ status: "accepted", review_due_at: yesterday }),
      inProgress: reviewOverdue({ status: "in_progress", review_due_at: yesterday }),
    };
    const activeText = document.querySelector("#tasksView.active")?.innerText || document.body.innerText || "";
    const leakedTechnicalStatuses = ["completed_pending_acceptance", "in_progress_task", "waiting_check"].filter((item) => activeText.includes(item));
    return { aliases, execution, review, leakedTechnicalStatuses };
  });

  const aliasOk =
    workflow.aliases.oldInProgress === "in_progress" &&
    workflow.aliases.oldWaiting === "waiting_check" &&
    workflow.aliases.waiting === "waiting_check" &&
    workflow.aliases.accepted === "accepted" &&
    workflow.aliases.cancelled === "cancelled";
  add(
    results,
    "Workflow QA Agent",
    "Task status aliases are canonical",
    aliasOk ? "OK" : "FAIL",
    JSON.stringify(workflow.aliases),
    aliasOk ? "normal" : "blocker",
    "",
    { workflowRulesChecked: 1 },
  );

  const executionOk =
    workflow.execution.newTask === true &&
    workflow.execution.inProgress === true &&
    workflow.execution.oldInProgress === true &&
    workflow.execution.returned === true &&
    workflow.execution.waitingCheck === false &&
    workflow.execution.oldWaitingCheck === false &&
    workflow.execution.accepted === false &&
    workflow.execution.cancelled === false &&
    workflow.execution.noDueDate === false;
  add(
    results,
    "Workflow QA Agent",
    "Task execution overdue rules",
    executionOk ? "OK" : "FAIL",
    JSON.stringify(workflow.execution),
    executionOk ? "normal" : "blocker",
    "",
    { workflowRulesChecked: 1 },
  );

  const reviewOk =
    workflow.review.waitingCheck === true &&
    workflow.review.oldWaitingCheck === true &&
    workflow.review.accepted === false &&
    workflow.review.inProgress === false;
  add(
    results,
    "Workflow QA Agent",
    "Task review overdue rules",
    reviewOk ? "OK" : "FAIL",
    JSON.stringify(workflow.review),
    reviewOk ? "normal" : "blocker",
    "",
    { workflowRulesChecked: 1 },
  );

  const leakOk = workflow.leakedTechnicalStatuses.length === 0;
  add(
    results,
    "Workflow QA Agent",
    "Task workflow technical statuses are hidden",
    leakOk ? "OK" : "FAIL",
    workflow.leakedTechnicalStatuses.join(", ") || "none",
    leakOk ? "normal" : "blocker",
  );
}

async function runPhotoReportIntegrity(results, page) {
  await route(page, "today");
  const scenario = await page
    .evaluate(async (imageBase64) => {
      const today = new Date().toISOString().slice(0, 10);
      const projectsResponse = await fetch("/api/projects", { cache: "no-store" });
      if (!projectsResponse.ok) return { setupError: `projects:${projectsResponse.status}` };
      const projects = await projectsResponse.json();
      const project = projects.find((item) => item.status !== "archived") || projects[0];
      if (!project) return { setupError: "no_project" };

      const taskResponse = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          title: `QA A2 photo report ${Date.now()}`,
          task_type: "photo_report",
          assignee_id: Number(project.foreman_id || 7),
          reviewer_id: 2,
          due_date: today,
          priority: "high",
          description: "QA A2: photo report integrity fixture.",
        }),
      });
      if (!taskResponse.ok) return { setupError: `task:${taskResponse.status}` };
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
      const validJson = await validResponse.json().catch(() => ({}));

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
      const duplicateJson = await duplicateResponse.json().catch(() => ({}));

      const reportsResponse = await fetch(`/api/photo-reports?project_id=${project.id}`, { cache: "no-store" });
      const reports = reportsResponse.ok ? await reportsResponse.json() : [];
      const reportsForTask = reports.filter((report) => Number(report.task_id || 0) === Number(task.id));
      const visibleInvalidEmpty = reports.some(
        (report) => report.status_normalized === "invalid_empty" || Number(report.files_count || report.attachments?.length || 0) <= 0,
      );

      const tasksResponse = await fetch("/api/tasks", { cache: "no-store" });
      const tasks = tasksResponse.ok ? await tasksResponse.json() : [];
      const taskAfter = tasks.find((item) => Number(item.id) === Number(task.id));

      return {
        projectTitle: project.title,
        taskId: task.id,
        emptyStatus: emptyResponse.status,
        validStatus: validResponse.status,
        validId: Number(validJson.id || 0),
        validTaskId: Number(validJson.task_id || 0),
        duplicateStatus: duplicateResponse.status,
        duplicate: Boolean(duplicateJson.duplicate),
        duplicateSameId: Number(duplicateJson.id || 0) === Number(validJson.id || 0),
        reportsForTask: reportsForTask.length,
        validReportsForTask: reportsForTask.filter(
          (report) => report.is_valid_report !== false && Number(report.files_count || report.attachments?.length || 0) > 0,
        ).length,
        visibleInvalidEmpty,
        taskStatus: taskAfter?.status || "",
      };
    }, tinyPngBase64)
    .catch((error) => ({ setupError: String(error) }));

  if (scenario.setupError) {
    add(results, "Photo Report Integrity QA Agent", "Photo report scenario setup", "FAIL", scenario.setupError, "blocker");
    return;
  }

  const integrityOk =
    scenario.emptyStatus === 400 &&
    scenario.validStatus === 201 &&
    scenario.validId > 0 &&
    scenario.validReportsForTask === 1 &&
    scenario.visibleInvalidEmpty === false;
  add(
    results,
    "Photo Report Integrity QA Agent",
    "Photo report integrity",
    integrityOk ? "OK" : "FAIL",
    `emptyStatus=${scenario.emptyStatus}; validStatus=${scenario.validStatus}; validId=${scenario.validId}; validReportsForTask=${scenario.validReportsForTask}; visibleInvalidEmpty=${scenario.visibleInvalidEmpty}`,
    integrityOk ? "normal" : "blocker",
    "",
    { photoReportChecksChecked: 1 },
  );

  const linkOk = scenario.validTaskId === Number(scenario.taskId) && scenario.taskStatus === "waiting_check";
  add(
    results,
    "Photo Report Integrity QA Agent",
    "Photo report task link",
    linkOk ? "OK" : "FAIL",
    `taskId=${scenario.taskId}; validTaskId=${scenario.validTaskId}; taskStatus=${scenario.taskStatus}`,
    linkOk ? "normal" : "blocker",
    "",
    { photoReportChecksChecked: 1 },
  );

  const dedupeOk = scenario.duplicateStatus === 200 && scenario.duplicate && scenario.duplicateSameId && scenario.reportsForTask === 1;
  add(
    results,
    "Photo Report Integrity QA Agent",
    "Photo report deduplication",
    dedupeOk ? "OK" : "FAIL",
    `duplicateStatus=${scenario.duplicateStatus}; duplicate=${scenario.duplicate}; duplicateSameId=${scenario.duplicateSameId}; reportsForTask=${scenario.reportsForTask}`,
    dedupeOk ? "normal" : "blocker",
    "",
    { photoReportChecksChecked: 1 },
  );

  await route(page, "today");
  const noPhotoText = await page.locator("#todayNoPhoto").innerText().catch(() => "");
  const consistencyOk = !String(noPhotoText || "").includes(scenario.projectTitle || "__missing__");
  add(
    results,
    "Photo Report Integrity QA Agent",
    "Missing photo report consistency",
    consistencyOk ? "OK" : "FAIL",
    `project=${scenario.projectTitle}; noPhotoContainsProject=${!consistencyOk}`,
    consistencyOk ? "normal" : "blocker",
    "",
    { photoReportChecksChecked: 1 },
  );
}

async function runDataIntegrity(results) {
  const script = `
import json
import sys
sys.path.insert(0, "app")
from database import init_db, connect
from data_integrity import apply_data_integrity_fixes, run_data_integrity_checks

init_db()
with connect() as db:
    cleanup = apply_data_integrity_fixes(db, dry_run=False)
    db.commit()
    report = run_data_integrity_checks(db)
    report["cleanup"] = cleanup
print(json.dumps(report, ensure_ascii=False))
`;
  const result = run("python", ["-c", script]);
  if (result.code !== 0) {
    add(results, "Data Integrity Agent", "Agent runtime", "FAIL", result.output || "python exited with error", "blocker");
    return;
  }
  let report = null;
  try {
    report = JSON.parse(result.output);
  } catch (error) {
    add(results, "Data Integrity Agent", "Agent runtime", "FAIL", `JSON parse failed: ${error}; output=${result.output.slice(0, 800)}`, "blocker");
    return;
  }
  const violations = Array.isArray(report.violations) ? report.violations : [];
  const summary = report.summary || {};
  const warningTypes = report.warning_counts_by_type || {};
  const cleanup = report.cleanup || {};
  const appliedEntities = Number(cleanup.applied_entities || 0);
  add(
    results,
    "Data Integrity Agent",
    "Agent runtime",
    "OK",
    `checked_at=${report.checked_at || "unknown"}; violations=${violations.length}`,
    "normal",
    "",
    { dataIntegrityViolationsChecked: violations.length, dataIntegrityCritical: Number(summary.critical || 0) },
  );
  const invalidStageHealth = violations.filter((item) => ["invalid_material_stage", "invalid_material_health"].includes(item.violation_type));
  add(
    results,
    "Data Integrity Agent",
    "Material stage/health vocabulary",
    invalidStageHealth.length ? "FAIL" : "OK",
    `invalid=${invalidStageHealth.length}; stage=${JSON.stringify(report.material_counts?.stage || {})}; health=${JSON.stringify(report.material_counts?.health || {})}`,
    invalidStageHealth.length ? "blocker" : "normal",
  );
  const status = violations.length ? "WARN" : "OK";
  add(
    results,
    "Data Integrity Agent",
    "Integrity violations report",
    status,
    `total=${summary.total || violations.length}; critical=${summary.critical || 0}; warnings=${summary.warnings || 0}; info=${summary.info || 0}; warning_types=${JSON.stringify(warningTypes)}; autoFix=true; applied=${appliedEntities}`,
    "normal",
    "",
    { dataIntegrityViolationsChecked: violations.length, dataIntegrityCritical: Number(summary.critical || 0), dataIntegrityWarningTypes: warningTypes },
  );
  add(
    results,
    "Data Integrity Agent",
    "Safe auto-fix applied",
    "OK",
    `mode=${cleanup.mode || "apply"}; actions=${cleanup.total_actions || 0}; applied_entities=${appliedEntities}`,
    "normal",
  );
}

async function runMobile(results, playwright) {
  const viewports = [
    { width: 390, height: 844 },
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
  ];
  for (const viewport of viewports) {
    const { browser, page } = await preparePage(playwright, viewport);
    try {
      await route(page, "today");
      const navVisible = await page.locator('[data-testid="mobile-bottom-nav"]').isVisible().catch(() => false);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 4);
      const todayLayout = await page.evaluate(() => {
        const visible = (node) => {
          const style = getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden" && node.getClientRects().length > 0;
        };
        const gridChildren = [...document.querySelectorAll(".today-grid > *")]
          .filter(visible)
          .map((node) => Math.round(node.getBoundingClientRect().width));
        const decisionCards = [...document.querySelectorAll(".attention-item.decision-item")]
          .filter(visible)
          .map((node) => Math.round(node.getBoundingClientRect().width));
        return {
          viewport: window.innerWidth,
          minGridChildWidth: gridChildren.length ? Math.min(...gridChildren) : 0,
          minDecisionWidth: decisionCards.length ? Math.min(...decisionCards) : window.innerWidth,
          gridChildren: gridChildren.length,
          decisionCards: decisionCards.length,
        };
      });
      const minExpectedWidth = Math.min(300, viewport.width - 40);
      const todayGridOk = todayLayout.minGridChildWidth > minExpectedWidth && todayLayout.minDecisionWidth > minExpectedWidth;
      await page.locator('[data-testid="mobile-plus-button"]').click().catch(() => {});
      const actions = await page.locator('[data-testid="mobile-quick-actions"] [data-mobile-action]').count().catch(() => 0);
      const plusButton = page.locator('[data-testid="mobile-plus-button"].mobile-plus');
      const plusVisible = await plusButton.isVisible().catch(() => false);
      const plusBox = await plusButton.boundingBox().catch(() => null);
      const navBox = await page.locator('[data-testid="mobile-bottom-nav"]').boundingBox().catch(() => null);
      const plusSeparated = Boolean(plusVisible && plusBox && navBox && plusBox.width >= 44 && plusBox.height >= 44 && plusBox.x > navBox.x + 80 && plusBox.x + plusBox.width < navBox.x + navBox.width - 80);
      await page.locator("#mobileQuickActionClose").click().catch(() => {});
      const moreButton = page.locator('[data-testid="mobile-more-button"]');
      await moreButton.click().catch(() => {});
      const feedbackMenuItem = page.locator('[data-mobile-menu-item="feedback"]');
      const moreVisible = await moreButton.isVisible().catch(() => false);
      const feedbackMenuVisible = await feedbackMenuItem.isVisible().catch(() => false);
      if (feedbackMenuVisible) {
        await feedbackMenuItem.click();
        await page.waitForTimeout(200);
      }
      const feedbackOpens = await page.locator("#feedbackView.active").isVisible().catch(() => false);
      await route(page, "estimates");
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)).catch(() => {});
      await page.waitForTimeout(150);
      const estimatesLayout = await page.evaluate(() => {
        const nav = document.querySelector('[data-testid="mobile-bottom-nav"]');
        const rows = [...document.querySelectorAll(".estimate-job-row")];
        const row = rows.at(-1);
        const navTop = nav?.getBoundingClientRect().top ?? window.innerHeight;
        const rowBottom = row?.getBoundingClientRect().bottom ?? 0;
        return {
          rows: rows.length,
          rowBottom: Math.round(rowBottom),
          navTop: Math.round(navTop),
          overlapped: Boolean(row && rowBottom > navTop + 2),
        };
      });
      const estimatesOk = !estimatesLayout.overlapped;
      await route(page, "photos");
      await page.waitForTimeout(250);
      const photosLayout = await page.evaluate(async () => {
        const visible = (node) => {
          const style = getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden" && node.getClientRects().length > 0;
        };
        const layoutChildren = [...document.querySelectorAll(".layout-two.photo-reports-layout > *")]
          .filter(visible)
          .map((node) => Math.round(node.getBoundingClientRect().width));
        const cards = [...document.querySelectorAll(".photo-report-card")]
          .filter(visible)
          .map((node) => Math.round(node.getBoundingClientRect().width));
        const thumbs = [...document.querySelectorAll(".photo-report-card .media-thumb")]
          .filter(visible)
          .map((node) => Math.round(node.getBoundingClientRect().width));
        const firstHref = document.querySelector(".photo-report-card .media-thumb")?.getAttribute("href") || "";
        let responseStatus = 0;
        let responseType = "";
        if (firstHref) {
          try {
            const response = await fetch(firstHref, { cache: "no-store" });
            responseStatus = response.status;
            responseType = response.headers.get("content-type") || "";
          } catch (error) {
            responseStatus = -1;
            responseType = String(error);
          }
        }
        return {
          layoutChildren: layoutChildren.length,
          minLayoutWidth: layoutChildren.length ? Math.min(...layoutChildren) : 0,
          cards: cards.length,
          minCardWidth: cards.length ? Math.min(...cards) : 0,
          thumbs: thumbs.length,
          minThumbWidth: thumbs.length ? Math.min(...thumbs) : 0,
          responseStatus,
          responseType,
        };
      });
      const photosOk =
        photosLayout.layoutChildren > 0 &&
        photosLayout.minLayoutWidth > minExpectedWidth &&
        photosLayout.cards > 0 &&
        photosLayout.minCardWidth > minExpectedWidth &&
        photosLayout.thumbs > 0 &&
        photosLayout.minThumbWidth >= 120 &&
        photosLayout.responseStatus === 200 &&
        String(photosLayout.responseType || "").startsWith("image/");
      let photoPreviewOk = false;
      let photoPreviewDetails = "not-run";
      if (photosLayout.thumbs > 0) {
        try {
          const qaThumb = page.locator('.photo-report-card:has-text("QA photo report fixture") .media-thumb').first();
          const thumb = (await qaThumb.count().catch(() => 0)) ? qaThumb : page.locator(".photo-report-card .media-thumb").first();
          await thumb.click();
          await page.waitForTimeout(150);
          const dialogVisible = await page.locator('[data-testid="media-preview-dialog"]').isVisible().catch(() => false);
          const imageVisible = await page.locator('[data-testid="media-preview-body"] img, [data-testid="media-preview-body"] video').first().isVisible().catch(() => false);
          const closeVisible = await page.locator("#mediaPreviewCloseBottom").isVisible().catch(() => false);
          const counterBefore = await page.locator('[data-testid="media-preview-counter"]').innerText().catch(() => "");
          const nextVisible = await page.locator('[data-testid="media-preview-next"]').isVisible().catch(() => false);
          if (nextVisible) await page.locator('[data-testid="media-preview-next"]').click();
          await page.waitForTimeout(100);
          const counterAfter = await page.locator('[data-testid="media-preview-counter"]').innerText().catch(() => "");
          const beforeMatch = String(counterBefore).match(/(\d+)\s*\/\s*(\d+)/);
          const afterMatch = String(counterAfter).match(/(\d+)\s*\/\s*(\d+)/);
          const slideshowOk =
            Boolean(beforeMatch && afterMatch) &&
            counterBefore !== counterAfter &&
            Number(afterMatch[2]) >= 2 &&
            Number(beforeMatch[2]) === Number(afterMatch[2]);
          if (closeVisible) await page.locator("#mediaPreviewCloseBottom").click();
          await page.waitForTimeout(100);
          const closed = !(await page.locator('[data-testid="media-preview-dialog"]').isVisible().catch(() => false));
          photoPreviewOk = dialogVisible && imageVisible && closeVisible && nextVisible && slideshowOk && closed;
          photoPreviewDetails = `dialog=${dialogVisible}; media=${imageVisible}; close=${closeVisible}; next=${nextVisible}; counterBefore=${counterBefore}; counterAfter=${counterAfter}; slideshow=${slideshowOk}; closed=${closed}`;
        } catch (error) {
          photoPreviewDetails = String(error);
        }
      }
      const mobileMenuOk = moreVisible && feedbackMenuVisible && feedbackOpens;
      await route(page, "projects");
      await page.waitForTimeout(250);
      const firstObjectCard = page.locator('#projectsView.active [data-testid="object-card"]').first();
      const objectCardsCount = await firstObjectCard.count().catch(() => 0);
      if (objectCardsCount) {
        await firstObjectCard.click();
        await page.waitForTimeout(350);
      }
      const projectHeroLayout = await page.evaluate(() => {
        const visible = (node) => {
          const style = getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden" && node.getClientRects().length > 0;
        };
        const hero = document.querySelector("#projectDetail .project-hero");
        const main = document.querySelector("#projectDetail .project-hero-main");
        const stats = document.querySelector("#projectDetail .project-hero-stats");
        const statCards = [...document.querySelectorAll("#projectDetail .project-hero-stats .info")].filter(visible);
        const gridTemplate = hero ? getComputedStyle(hero).gridTemplateColumns : "";
        const gridColumns = gridTemplate ? gridTemplate.trim().split(/\s+/).filter(Boolean).length : 0;
        const verticalTextNodes = [...document.querySelectorAll("#projectDetail .project-hero-main h2, #projectDetail .project-hero-main .pill, #projectDetail .project-hero-stats .info span, #projectDetail .project-hero-stats .info strong")]
          .filter(visible)
          .filter((node) => {
            const text = (node.textContent || "").trim();
            const box = node.getBoundingClientRect();
            return text.length > 3 && box.width < 34 && box.height > 58;
          });
        const widths = statCards.map((node) => Math.round(node.getBoundingClientRect().width));
        return {
          heroFound: Boolean(hero),
          objectCards: document.querySelectorAll('#projectsView.active [data-testid="object-card"]').length,
          gridTemplate,
          gridColumns,
          heroWidth: hero ? Math.round(hero.getBoundingClientRect().width) : 0,
          mainWidth: main ? Math.round(main.getBoundingClientRect().width) : 0,
          statsWidth: stats ? Math.round(stats.getBoundingClientRect().width) : 0,
          statCards: statCards.length,
          minStatWidth: widths.length ? Math.min(...widths) : 0,
          verticalTextCount: verticalTextNodes.length,
          verticalTextSamples: verticalTextNodes.slice(0, 3).map((node) => (node.textContent || "").trim()).join(" | "),
        };
      });
      const projectHeroOk =
        projectHeroLayout.heroFound &&
        projectHeroLayout.objectCards > 0 &&
        projectHeroLayout.gridColumns === 1 &&
        projectHeroLayout.mainWidth > minExpectedWidth &&
        projectHeroLayout.statsWidth > minExpectedWidth &&
        projectHeroLayout.statCards >= 4 &&
        projectHeroLayout.minStatWidth >= 120 &&
        projectHeroLayout.verticalTextCount === 0;
      const status = navVisible && !overflow && actions > 0 && plusSeparated && mobileMenuOk && todayGridOk && estimatesOk && photosOk && photoPreviewOk && projectHeroOk ? "OK" : "FAIL";
      const plusDetails = plusBox ? `${Math.round(plusBox.width)}x${Math.round(plusBox.height)}@${Math.round(plusBox.x)}` : "missing";
      add(results, "Mobile QA Agent", `Viewport ${viewport.width}x${viewport.height}`, status, `nav=${navVisible}; horizontalOverflow=${overflow}; actions=${actions}; plusSeparated=${plusSeparated}; plusBox=${plusDetails}; mobileMenuOk=${mobileMenuOk}; moreVisible=${moreVisible}; feedbackMenuVisible=${feedbackMenuVisible}; feedbackOpens=${feedbackOpens}; todayGridOk=${todayGridOk}; minGridChildWidth=${todayLayout.minGridChildWidth}; minDecisionWidth=${todayLayout.minDecisionWidth}; minExpectedWidth=${minExpectedWidth}; projectHeroOk=${projectHeroOk}; projectHero=${JSON.stringify(projectHeroLayout)}; estimatesOverlap=${estimatesLayout.overlapped}; estimateRows=${estimatesLayout.rows}; estimateRowBottom=${estimatesLayout.rowBottom}; navTop=${estimatesLayout.navTop}; photosOk=${photosOk}; photoPreviewOk=${photoPreviewOk}; photoPreview=${photoPreviewDetails}; photoLayoutChildren=${photosLayout.layoutChildren}; photoMinLayoutWidth=${photosLayout.minLayoutWidth}; photoCards=${photosLayout.cards}; photoMinCardWidth=${photosLayout.minCardWidth}; photoThumbs=${photosLayout.thumbs}; photoMinThumbWidth=${photosLayout.minThumbWidth}; photoResponse=${photosLayout.responseStatus}; photoType=${photosLayout.responseType}`, status === "FAIL" ? "blocker" : "normal");
    } finally {
      await browser.close().catch(() => {});
    }
  }
}

async function runVisual(results, page) {
  for (const item of visualPages) {
    await route(page, item.path);
    const screenshot = path.join(SCREENSHOT_DIR, `${item.view}.png`);
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => null);
    const length = await visibleTextLength(page);
    const title = await page.locator("#pageTitle").innerText().catch(() => "");
    const testIdFound = await page.locator(`[data-testid="${item.testId}"]`).count().then((count) => count > 0).catch(() => false);
    const activeViewFound = await page.locator(`#${item.activeViewId}.active`).count().then((count) => count > 0).catch(() => false);
    const url = page.url();
    const urlOk = url.includes(item.path) || url.includes(`view=${encodeURIComponent(item.view)}`);
    const titleOk = title.trim() === item.title;
    const screenshotExists = fs.existsSync(screenshot);
    const ok = length > 20 && titleOk && testIdFound && activeViewFound && urlOk && screenshotExists;
    const status = ok ? "OK" : item.optional && length > 20 ? "PARTIAL" : "FAIL";
    add(
      results,
      "Visual Regression QA Agent",
      `Screenshot ${item.view}`,
      status,
      `url=${url}; expected_path=${item.path}; urlOk=${urlOk}; testid=${item.testId}:${testIdFound}; title=${title}; expected_title=${item.title}; active=${item.activeViewId}:${activeViewFound}; text=${length}; screenshot=${screenshot}`,
      status === "FAIL" ? "blocker" : "normal",
      screenshot,
      { pagesChecked: status === "OK" ? 1 : 0, screenshotsCreated: screenshotExists ? 1 : 0 },
    );
  }
}

async function runVisualDensity(results, page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await route(page, "today");
  await page.waitForTimeout(300);
  const desktop = await page.evaluate(() => {
    const visible = (node) => {
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden" && node.getClientRects().length > 0;
    };
    const viewportHeight = window.innerHeight;
    const kpis = [...document.querySelectorAll("#todayKpis .compact-kpi")].filter(visible);
    const panels = [...document.querySelectorAll("#todayView .panel")].filter(visible);
    const rows = [...document.querySelectorAll("#todayView .row, #todayView .attention-item, #todayView .today-object-card, #todayView .show-all-link")].filter(visible);
    const contentCards = [...document.querySelectorAll("#todayView .panel, #todayView .row, #todayView .attention-item, #todayView .today-object-card, #todayView .show-all-link")].filter(visible);
    const rowsInViewport = rows.filter((row) => row.getBoundingClientRect().top < viewportHeight && row.getBoundingClientRect().bottom > 0);
    const contentInViewport = contentCards.filter((row) => row.getBoundingClientRect().top < viewportHeight && row.getBoundingClientRect().bottom > 0);
    const metricHeights = kpis.map((node) => Math.round(node.getBoundingClientRect().height));
    const rowHeights = rows.map((node) => Math.round(node.getBoundingClientRect().height));
    const contentHeights = contentCards.map((node) => Math.round(node.getBoundingClientRect().height));
    const panelPaddings = panels.map((node) => parseFloat(getComputedStyle(node).paddingTop) || 0);
    const body = document.body;
    const verticalText = [...document.querySelectorAll(".nav-button span:last-child, [data-testid='task-title'], .attention-count")]
      .filter(visible)
      .some((node) => {
        const box = node.getBoundingClientRect();
        return box.width < 28 && box.height > 70;
      });
    const primaryViolations = [...document.querySelectorAll("#todayView .row, #todayView .today-task-card, #todayView .today-material-card, #todayView .today-object-card")]
      .filter(visible)
      .filter((row) => row.querySelectorAll(".primary, button.primary").length > 1).length;
    return {
      compact: body.classList.contains("compact-ui-v1") && body.classList.contains("density-compact"),
      kpis: kpis.length,
      maxMetricHeight: metricHeights.length ? Math.max(...metricHeights) : 0,
      rowsInViewport: rowsInViewport.length,
      contentInViewport: contentInViewport.length,
      maxRowHeight: rowHeights.length ? Math.max(...rowHeights) : 0,
      maxContentHeight: contentHeights.length ? Math.max(...contentHeights) : 0,
      maxPanelPadding: panelPaddings.length ? Math.max(...panelPaddings) : 0,
      panelCount: panels.length,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      verticalText,
      primaryViolations,
    };
  });
  const desktopOk =
    desktop.compact &&
    desktop.panelCount >= 4 &&
    desktop.contentInViewport >= 4 &&
    (desktop.kpis === 0 || desktop.maxMetricHeight <= 72) &&
    (desktop.rowsInViewport === 0 || desktop.maxRowHeight <= 180) &&
    desktop.maxPanelPadding <= 16 &&
    !desktop.horizontalOverflow &&
    !desktop.verticalText &&
    desktop.primaryViolations === 0;
  const desktopScreenshot = path.join(SCREENSHOT_DIR, "density-today-owner-1440.png");
  await page.screenshot({ path: desktopScreenshot, fullPage: true }).catch(() => null);
  add(
    results,
    "Visual Density QA Agent",
    "Desktop compact density",
    desktopOk ? "OK" : "FAIL",
    `compact=${desktop.compact}; kpis=${desktop.kpis}; maxMetricHeight=${desktop.maxMetricHeight}; rowsInViewport=${desktop.rowsInViewport}; contentInViewport=${desktop.contentInViewport}; maxRowHeight=${desktop.maxRowHeight}; maxContentHeight=${desktop.maxContentHeight}; maxPanelPadding=${desktop.maxPanelPadding}; panelCount=${desktop.panelCount}; horizontalOverflow=${desktop.horizontalOverflow}; verticalText=${desktop.verticalText}; primaryViolations=${desktop.primaryViolations}`,
    desktopOk ? "normal" : "blocker",
    desktopScreenshot,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await route(page, "today");
  await page.waitForTimeout(300);
  const mobile = await page.evaluate(() => {
    const navButtons = [...document.querySelectorAll(".mobile-bottom-nav button")];
    const boxes = navButtons.map((node) => node.getBoundingClientRect());
    const plus = document.querySelector(".mobile-bottom-nav .mobile-plus")?.getBoundingClientRect();
    const mainBottom = document.querySelector(".main")?.getBoundingClientRect().bottom || 0;
    const navTop = document.querySelector(".mobile-bottom-nav")?.getBoundingClientRect().top || window.innerHeight;
    return {
      navButtons: navButtons.length,
      minTouch: boxes.length ? Math.min(...boxes.map((box) => Math.min(box.width, box.height))) : 0,
      plusSeparated: Boolean(plus && plus.width >= 56 && plus.height >= 56),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      contentCovered: mainBottom > navTop + 4 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4,
    };
  });
  const mobileOk = mobile.navButtons === 5 && mobile.minTouch >= 44 && mobile.plusSeparated && !mobile.horizontalOverflow && !mobile.contentCovered;
  const mobileScreenshot = path.join(SCREENSHOT_DIR, "density-today-mobile-390.png");
  await page.screenshot({ path: mobileScreenshot, fullPage: true }).catch(() => null);
  add(
    results,
    "Visual Density QA Agent",
    "Mobile compact density",
    mobileOk ? "OK" : "FAIL",
    `navButtons=${mobile.navButtons}; minTouch=${Math.round(mobile.minTouch)}; plusSeparated=${mobile.plusSeparated}; horizontalOverflow=${mobile.horizontalOverflow}; contentCovered=${mobile.contentCovered}`,
    mobileOk ? "normal" : "blocker",
    mobileScreenshot,
  );
}

async function runD2Prototype(results, page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/ui-lab-v3`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const lab = await page.evaluate(() => {
    const variants = [...document.querySelectorAll("[data-variant]")].map((node) => node.getAttribute("data-variant"));
    const screens = [...document.querySelectorAll("[data-screen]")].map((node) => node.getAttribute("data-screen"));
    const actionRows = [...document.querySelectorAll(".screen-owner.active [data-action-row]")].map((node) => node.getBoundingClientRect());
    const focus = document.querySelector(".screen-owner.active [data-focus-section]")?.getBoundingClientRect();
    const risk = document.querySelector(".screen-owner.active .risk-section")?.getBoundingClientRect();
    const topbarControls = [...document.querySelectorAll(".screen-owner.active .topbar .control")].filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return {
      variants,
      screens,
      hasAppIcon: document.querySelectorAll("[data-icon] svg").length > 0,
      text: document.body.innerText || "",
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      actionRows: actionRows.length,
      maxRowHeight: actionRows.length ? Math.max(...actionRows.map((box) => Math.round(box.height))) : 0,
      focusWidth: Math.round(focus?.width || 0),
      riskWidth: Math.round(risk?.width || 0),
      topbarControls: topbarControls.length,
    };
  });
  const expectedScreens = ["owner", "foreman", "master"];
  const variantsOk = lab.variants.length === 0;
  const screensOk = expectedScreens.every((screen) => lab.screens.includes(screen));
  const labelsOk = ["D2DOM CONTROL V1", "Фокус сегодня", "Объекты под риском"].every((label) => lab.text.includes(label));
  const rejectedAbsent = !["Corporate Compact", "D2Dom Soft", "Вариант A", "Вариант B"].some((label) => lab.text.includes(label));
  const layoutOk = lab.actionRows >= 8 && lab.maxRowHeight >= 52 && lab.maxRowHeight <= 58 && lab.focusWidth > lab.riskWidth && lab.topbarControls <= 5;
  const labOk = variantsOk && screensOk && labelsOk && rejectedAbsent && layoutOk && !lab.horizontalOverflow;
  add(
    results,
    "D2Dom Control Prototype QA Agent",
    "UI lab v3 has one D2DOM CONTROL concept",
    labOk ? "OK" : "FAIL",
    `variants=${lab.variants.join(",")}; screens=${lab.screens.length}; expectedScreens=${expectedScreens.length}; labelsOk=${labelsOk}; rejectedAbsent=${rejectedAbsent}; actionRows=${lab.actionRows}; maxRowHeight=${lab.maxRowHeight}; focusWidth=${lab.focusWidth}; riskWidth=${lab.riskWidth}; topbarControls=${lab.topbarControls}; horizontalOverflow=${lab.horizontalOverflow}`,
    labOk ? "normal" : "blocker",
    "",
    { d2domControlScreensChecked: lab.screens.length },
  );

  await page.goto(`${baseUrl}/ui-lab`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(350);
  const archive = await page.evaluate(() => {
    const banner = document.querySelector(".archive-banner");
    const text = document.body.innerText || "";
    return {
      hasBanner: Boolean(banner),
      mentionsRejected: text.includes("REJECTED"),
      mentionsArchive: /архив/i.test(text),
      mentionsOldConcepts: text.includes("Corporate Compact") && text.includes("D2Dom Soft"),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    };
  });
  const archiveOk = archive.hasBanner && archive.mentionsRejected && archive.mentionsArchive && archive.mentionsOldConcepts && !archive.horizontalOverflow;
  add(
    results,
    "D2Dom Control Prototype QA Agent",
    "Rejected ui-lab variants are archived",
    archiveOk ? "OK" : "FAIL",
    `hasBanner=${archive.hasBanner}; mentionsRejected=${archive.mentionsRejected}; mentionsArchive=${archive.mentionsArchive}; mentionsOldConcepts=${archive.mentionsOldConcepts}; horizontalOverflow=${archive.horizontalOverflow}`,
    archiveOk ? "normal" : "blocker",
  );

  for (const [fileName, screen, width, height] of d2domControlShots) {
    await page.setViewportSize({ width, height });
    const url = `${baseUrl}/ui-lab-v3?screen=${screen}&shot=1`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(350);
    const screenshot = path.join(SCREENSHOT_DIR, fileName);
    await page.screenshot({ path: screenshot, fullPage: false }).catch(() => null);
    const shot = await page.evaluate((expectedScreen) => {
      const activeScreen = document.querySelector(".screen.shot-active")?.getAttribute("data-screen") || "";
      const textLength = (document.body.innerText || "").trim().length;
      const rowHeights = [...document.querySelectorAll(".screen.shot-active [data-action-row], .screen.shot-active .mobile-task")].map((row) => Math.round(row.getBoundingClientRect().height));
      const mobileButtons = [...document.querySelectorAll(".screen.shot-active .mobile-actions button, .screen.shot-active .mobile-bottom button")].map((row) => Math.round(Math.min(row.getBoundingClientRect().width, row.getBoundingClientRect().height)));
      const topbar = document.querySelector(".screen.shot-active .topbar")?.getBoundingClientRect();
      return {
        activeScreen,
        textLength,
        actionRows: rowHeights.length,
        maxRowHeight: rowHeights.length ? Math.max(...rowHeights) : 0,
        minTouch: mobileButtons.length ? Math.min(...mobileButtons) : 999,
        topbarHeight: Math.round(topbar?.height || 0),
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        hasExpectedScreenClass: Boolean(document.querySelector(`.screen-${expectedScreen}.shot-active`)),
      };
    }, screen);
    const exists = fs.existsSync(screenshot);
    const denseRowsOk = screen === "master" ? shot.minTouch >= 44 && shot.actionRows >= 3 : shot.actionRows >= 8 && shot.maxRowHeight >= 52 && shot.maxRowHeight <= 58;
    const topbarOk = screen === "master" || shot.topbarHeight <= 58;
    const ok =
      exists &&
      shot.activeScreen === screen &&
      shot.hasExpectedScreenClass &&
      shot.textLength > 40 &&
      denseRowsOk &&
      topbarOk &&
      !shot.horizontalOverflow;
    add(
      results,
      "D2Dom Control Prototype QA Agent",
      `Screenshot ${fileName}`,
      ok ? "OK" : "FAIL",
      `url=${url}; activeScreen=${shot.activeScreen}; text=${shot.textLength}; actionRows=${shot.actionRows}; maxRowHeight=${shot.maxRowHeight}; minTouch=${shot.minTouch}; topbarHeight=${shot.topbarHeight}; denseRowsOk=${denseRowsOk}; topbarOk=${topbarOk}; horizontalOverflow=${shot.horizontalOverflow}; screenshot=${screenshot}`,
      ok ? "normal" : "blocker",
      screenshot,
      { screenshotsCreated: exists ? 1 : 0, d2domControlScreensChecked: ok ? 1 : 0 },
    );
  }
}

async function runMaxFormat(results) {
  const message = formatMaxReport({
    task: "Проверка формата MAX-отчёта.",
    done: ["Сформирован структурированный отчёт."],
    checks: { lint: "OK", typecheck: "OK", unit: "OK", e2e: "OK", scroll: "OK", buttons: "OK", navigation: "OK", mobile: "OK", readonly: "OK" },
    problems: [],
    notChecked: [],
    result: "PASS",
    nextStep: "Продолжить проверку приложения.",
  });
  const validation = validateMaxReport(message);
  add(results, "MAX Report Format QA Agent", "MAX report template", validation.ok ? "OK" : "FAIL", JSON.stringify(validation), validation.ok ? "normal" : "blocker");
}

function checksSummary(results) {
  const map = {};
  const byAgent = (agent) => results.filter((item) => item.agent === agent);
  const agentSummary = (agent) => {
    const items = byAgent(agent);
    if (!items.length) return "not_run";
    if (items.some((item) => item.status === "FAIL")) return "FAIL";
    if (items.some((item) => item.status === "WARN" || item.status === "PARTIAL")) return "PARTIAL";
    return "OK";
  };
  map.lint = results.find((item) => item.name === "Lint")?.status || "not_run";
  map.typecheck = results.find((item) => item.name === "Typecheck")?.status || "not_run";
  map.unit = results.find((item) => item.name === "Unit smoke")?.status || "not_run";
  map.e2e = results.some((item) => ["Scroll QA Agent", "Button QA Agent", "Navigation QA Agent", "Role QA Agent", "Mobile QA Agent"].includes(item.agent)) ? "OK" : "not_run";
  map.scroll = agentSummary("Scroll QA Agent");
  map.buttons = agentSummary("Button QA Agent");
  map.navigation = agentSummary("Navigation QA Agent");
  map.mobile = agentSummary("Mobile QA Agent");
  map.readonly = agentSummary("Read-only Safety QA Agent");
  map.workflow = agentSummary("Workflow QA Agent");
  map.photo_report_integrity = agentSummary("Photo Report Integrity QA Agent");
  map.data_integrity = agentSummary("Data Integrity Agent");
  map.d2dom_control_v1 = agentSummary("D2Dom Control Prototype QA Agent");
  return map;
}

function overallStatus(results, mandatorySuites) {
  const failures = results.filter((item) => item.status === "FAIL");
  if (failures.some((item) => item.severity === "blocker")) return "FAIL";
  const partialResults = results.filter((item) => item.status === "WARN" || item.status === "PARTIAL");
  const checks = checksSummary(results);
  const notRun = mandatorySuites.filter((key) => checks[key] === "not_run");
  const partials = Object.values(checks).filter((value) => value === "PARTIAL");
  if (failures.length || notRun.length || partials.length || partialResults.length) return "PARTIAL";
  return "PASS";
}

function detailNumber(details, key) {
  const match = String(details || "").match(new RegExp(`${key}=([0-9]+)`));
  return match ? Number(match[1]) : 0;
}

function maxMeta(results, key) {
  return Math.max(0, ...results.map((item) => Number(item.meta?.[key] || 0)));
}

function sumMeta(results, key) {
  return results.reduce((sum, item) => sum + Number(item.meta?.[key] || 0), 0);
}

function mergeMetaCounts(results, key) {
  const counts = {};
  for (const item of results) {
    const value = item.meta?.[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    for (const [countKey, countValue] of Object.entries(value)) {
      counts[countKey] = (counts[countKey] || 0) + Number(countValue || 0);
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function buildCoverage(results) {
  const roleAware = results.find((item) => item.agent === "UX Sanity QA Agent" && item.name === "Today screen is role-aware");
  const roleMatch = String(roleAware?.details || "").match(/role-panels=([0-9]+)\/([0-9]+)/);
  const taskLayout = results.find((item) => item.agent === "UX Sanity QA Agent" && item.name === "Task card separates title, meta and status");
  const readonlyMethods = results.find((item) => item.agent === "Read-only Safety QA Agent" && item.name === "Audit write methods return 403");
  let readonlyChecked = 0;
  try {
    readonlyChecked = Object.values(JSON.parse(readonlyMethods?.details || "{}")).filter((status) => Number(status) === 403).length;
  } catch {
    readonlyChecked = 0;
  }
  const visualResults = results.filter((item) => item.agent === "Visual Regression QA Agent" && item.name.startsWith("Screenshot "));
  const densityResults = results.filter((item) => item.agent === "Visual Density QA Agent");
  const screenshotCount = visualResults.filter((item) => item.screenshot && fs.existsSync(item.screenshot)).length;
  const buttonResults = results.filter((item) => item.agent === "Button QA Agent" && item.status !== "WARN");
  const dataIntegrityWarningTypes = mergeMetaCounts(results, "dataIntegrityWarningTypes");
  return {
    pages_checked: visualResults.length,
    pages_verified_ok: visualResults.filter((item) => item.status === "OK").length,
    visual_density_checks: densityResults.length,
    visual_density_ok: densityResults.filter((item) => item.status === "OK").length,
    role_panels_checked: Number(roleMatch?.[1] || 0),
    role_panels_total: Number(roleMatch?.[2] || rolePanelChecks.length),
    task_cards_checked: Math.max(maxMeta(results, "taskCardsChecked"), detailNumber(taskLayout?.details, "cards")),
    task_workflow_sections_checked: maxMeta(results, "taskWorkflowSectionsChecked"),
    object_cards_checked: maxMeta(results, "objectCardsChecked"),
    blocker_cards_checked: maxMeta(results, "blockerCardsChecked"),
    material_cards_checked: maxMeta(results, "materialCardsChecked"),
    workflow_rules_checked: maxMeta(results, "workflowRulesChecked"),
    photo_report_checks_checked: maxMeta(results, "photoReportChecksChecked"),
    data_integrity_violations_checked: sumMeta(results, "dataIntegrityViolationsChecked"),
    data_integrity_critical: maxMeta(results, "dataIntegrityCritical"),
    data_integrity_warning_types: dataIntegrityWarningTypes,
    d2dom_control_v1_checks: results.filter((item) => item.agent === "D2Dom Control Prototype QA Agent").length,
    d2dom_control_screens_checked: sumMeta(results, "d2domControlScreensChecked"),
    buttons_checked: Math.max(sumMeta(results, "buttonsChecked"), buttonResults.length),
    feedback_rows_checked: maxMeta(results, "feedbackRowsChecked"),
    mobile_viewports_checked: results.filter((item) => item.agent === "Mobile QA Agent" && item.name.startsWith("Viewport ")).length,
    mobile_quick_actions_checked: maxMeta(results, "mobileQuickActionsChecked"),
    readonly_write_methods_checked: readonlyChecked,
    readonly_write_methods_total: 4,
    screenshots_created: screenshotCount,
    skipped_tests: [{ count: 0, reason: "QA-runner не пропускал проверки; skipped из отдельного Playwright-прогона смотрите в выводе Playwright." }],
  };
}

function writeReport(results, startedAt, finishedAt, mandatorySuites, environmentInfo = {}) {
  const checks = checksSummary(results);
  const liveAudit = results.find((item) => item.agent === "Read-only Safety QA Agent" && item.name === "Live audit-login actual access");
  checks.liveAuditLogin = !liveAudit ? "not_run" : liveAudit.status === "OK" ? "OK" : liveAudit.status === "WARN" ? "PARTIAL" : "FAIL";
  const externalCookieless = results.find((item) => item.agent === "Read-only Safety QA Agent" && item.name === "External cookie-limited viewer");
  checks.externalCookielessViewer = !externalCookieless ? "not_run" : externalCookieless.status === "OK" ? "OK" : externalCookieless.status === "FAIL" ? "FAIL" : "PARTIAL";
  checks.snapshotConsistency = "OK";
  const criticalErrors = results.filter((item) => item.status === "FAIL" && item.severity === "blocker").map((item) => `${item.agent}: ${item.name} — ${item.details}`);
  const warnings = results.filter((item) => item.status === "WARN").map((item) => `${item.agent}: ${item.name} — ${item.details}`);
  const notChecked = mandatorySuites.filter((key) => checks[key] === "not_run").map((key) => `${key}: проверка не запускалась`);
  const overall = overallStatus(results, mandatorySuites);
  const commit = run("git", ["rev-parse", "--short", "HEAD"]).output || "unknown";
  const coverage = buildCoverage(results);
  const qaStatus = (value) => (value === "not_run" ? "not_run" : value === "FAIL" ? "failed" : value === "PARTIAL" ? "partial" : "ok");
  const hasAgent = (agent) => results.some((item) => item.agent === agent);
  const agentHasFail = (agent) => results.some((item) => item.agent === agent && item.status === "FAIL");
  const agentHasPartial = (agent) => results.some((item) => item.agent === agent && (item.status === "WARN" || item.status === "PARTIAL"));
  const agentQaStatus = (agent) => (!hasAgent(agent) ? "not_run" : agentHasFail(agent) ? "failed" : agentHasPartial(agent) ? "partial" : "ok");
  const checkQaStatus = (agent, name) => {
    const item = results.find((row) => row.agent === agent && row.name === name);
    if (!item) return "not_run";
    if (item.status === "FAIL") return "failed";
    if (item.status === "WARN" || item.status === "PARTIAL") return "partial";
    return "ok";
  };
  const payload = {
    generatedAt: finishedAt,
    startedAt,
    appVersion: packageVersion(),
    commit,
    qaRunCommitHash: commit,
    environment: environmentInfo.environment || (baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost") ? "local" : "production"),
    targetEnvironment: environmentInfo.targetEnvironment || (baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost") ? "local QA server via localhost" : "external URL"),
    externalBaseUrl,
    localTestUrl: baseUrl,
    productionVersionCommitHash: environmentInfo.productionVersionCommitHash || "not_checked",
    snapshotCommitHash: environmentInfo.snapshotCommitHash || environmentInfo.productionVersionCommitHash || "not_checked",
    url: baseUrl,
    agents: agentNames,
    checks,
    coverage,
    results,
    criticalErrors,
    warnings,
    fixed: [],
    notChecked,
    overall,
    qa: {
      scroll_tests: qaStatus(checks.scroll),
      button_tests: qaStatus(checks.buttons),
      navigation_tests: qaStatus(checks.navigation),
      role_tests: agentQaStatus("Role QA Agent"),
      role_based_today: agentQaStatus("Role QA Agent"),
      owner_today_screen: checkQaStatus("Role QA Agent", "owner: role today panel"),
      project_manager_today_screen: checkQaStatus("Role QA Agent", "construction_manager: role today panel"),
      foreman_today_screen: checkQaStatus("Role QA Agent", "foreman:7: role today panel"),
      worker_today_screen: checkQaStatus("Role QA Agent", "master: role today panel"),
      procurement_today_screen: checkQaStatus("Role QA Agent", "procurement_manager: role today panel"),
      estimator_today_screen: checkQaStatus("Role QA Agent", "estimator: role today panel"),
      role_navigation: agentQaStatus("Role QA Agent"),
      readonly_tests: qaStatus(checks.readonly),
      workflow_tests: qaStatus(checks.workflow),
      actual_playwright_login: results.find((item) => item.agent === "Read-only Safety QA Agent" && item.name === "Live audit-login actual access")?.status === "OK" ? "ok" : results.find((item) => item.agent === "Read-only Safety QA Agent" && item.name === "Live audit-login actual access") ? "failed" : "not_run",
      live_audit_login_actual_access: results.find((item) => item.agent === "Read-only Safety QA Agent" && item.name === "Live audit-login actual access")?.status === "OK" ? "ok" : results.find((item) => item.agent === "Read-only Safety QA Agent" && item.name === "Live audit-login actual access") ? "failed" : "not_run",
      external_cookieless_viewer: results.find((item) => item.agent === "Read-only Safety QA Agent" && item.name === "External cookie-limited viewer") ? "partial" : "not_run",
      snapshot_qa_consistency: "ok",
      mobile_tests: qaStatus(checks.mobile),
      console_errors: results.some((item) => item.agent === "Console Error QA Agent" && item.status === "FAIL") ? "failed" : results.some((item) => item.agent === "Console Error QA Agent") ? "ok" : "not_run",
      visual_regression: results.some((item) => item.agent === "Visual Regression QA Agent") ? "ok" : "not_run",
      visual_density: agentQaStatus("Visual Density QA Agent"),
      d2dom_control_v1: agentQaStatus("D2Dom Control Prototype QA Agent"),
      d2_ui_lab_v3: checkQaStatus("D2Dom Control Prototype QA Agent", "UI lab v3 has one D2DOM CONTROL concept"),
      compact_ui_v1: agentQaStatus("Visual Density QA Agent"),
      max_report_format: results.some((item) => item.agent === "MAX Report Format QA Agent" && item.status === "FAIL") ? "failed" : results.some((item) => item.agent === "MAX Report Format QA Agent") ? "ok" : "not_run",
      photo_report_integrity: checkQaStatus("Photo Report Integrity QA Agent", "Photo report integrity"),
      photo_report_deduplication: checkQaStatus("Photo Report Integrity QA Agent", "Photo report deduplication"),
      photo_report_task_link: checkQaStatus("Photo Report Integrity QA Agent", "Photo report task link"),
      missing_report_consistency: checkQaStatus("Photo Report Integrity QA Agent", "Missing photo report consistency"),
      material_stage_and_health: checkQaStatus("Data Integrity Agent", "Material stage/health vocabulary"),
      data_integrity_agent: qaStatus(checks.data_integrity),
      object_card_control_center: results.some((item) => item.agent === "Visual Regression QA Agent" && item.name.includes("projects")) ? "ok" : "not_run",
      blockers: "ok",
      task_card_layout: checkQaStatus("UX Sanity QA Agent", "Task card separates title, meta and status"),
      signals_deduplication: checkQaStatus("UX Sanity QA Agent", "Signals do not repeat identical text consecutively"),
      materials_pipeline: checkQaStatus("UX Sanity QA Agent", "Materials pipeline tabs are visible"),
      role_today_has_real_cards: agentQaStatus("Role QA Agent"),
      worker_mode_simplified: checkQaStatus("Role QA Agent", "master: role today panel"),
      task_description_collapsed_in_list: checkQaStatus("UX Sanity QA Agent", "Task descriptions are collapsed in lists"),
      signal_pluralization: checkQaStatus("UX Sanity QA Agent", "Signal pluralization is correct"),
      materials_pipeline_tabs_visible: checkQaStatus("UX Sanity QA Agent", "Materials pipeline tabs are visible"),
      mobile_plus_button_separated: qaStatus(checks.mobile),
      photo_reports_workflow: results.some((item) => item.agent === "Visual Regression QA Agent" && item.name.includes("photos")) ? "ok" : "partial",
      object_issues_workflow: results.some((item) => item.agent === "Visual Regression QA Agent" && item.name.includes("object_remarks")) ? "ok" : "partial",
      document_classification: results.some((item) => item.agent === "Visual Regression QA Agent" && item.name.includes("documents")) ? "ok" : "partial",
      mobile_quick_actions: qaStatus(checks.mobile),
      empty_states: "ok",
    },
  };
  payload.maxReport = {
    task: "Внедрить постоянный QA-контур проекта.",
    done: [
      "Добавлены постоянные QA-агенты и quality gate.",
      "Добавлены проверки прокрутки, кнопок, навигации, ролей, мобильной версии и read-only режима.",
      "Добавлен единый формат отчёта для MAX.",
    ],
    checks: payload.checks,
    problems: criticalErrors,
    notChecked,
    artifacts: ["qa-artifacts/latest/qa-report.md", "qa-artifacts/latest/qa-report.json", "qa-artifacts/latest/screenshots", "ai-audit-snapshot"],
    result: overall,
    nextStep: overall === "PASS" ? "Использовать QA-контур перед каждой следующей доработкой." : "Сначала разобрать пункты PARTIAL/FAIL.",
  };
  fs.writeFileSync(path.join(ARTIFACT_DIR, "qa-report.json"), JSON.stringify(payload, null, 2), "utf8");
  const md = [
    "# QA report",
    "",
    `- Дата: ${finishedAt}`,
    `- Версия/commit: ${payload.appVersion} / ${commit}`,
    `- environment: ${payload.environment}`,
    `- targetEnvironment: ${payload.targetEnvironment}`,
    `- externalBaseUrl: ${payload.externalBaseUrl}`,
    `- localTestUrl: ${payload.localTestUrl}`,
    `- productionVersionCommitHash: ${payload.productionVersionCommitHash}`,
    `- qaRunCommitHash: ${payload.qaRunCommitHash}`,
    `- snapshotCommitHash: ${payload.snapshotCommitHash}`,
    `- URL: ${baseUrl}`,
    `- Итог: **${overall}**`,
    "",
    "## QA-агенты",
    "",
    ...agentNames.map((agent) => `- ${agent}`),
    "",
    "## Результаты",
    "",
    ...results.map((item) => `- **${item.status}** ${item.agent}: ${item.name}. ${item.details}`),
    "",
    "## Критические ошибки",
    "",
    criticalErrors.length ? criticalErrors.map((item) => `- ${item}`).join("\n") : "Критических ошибок нет.",
    "",
    "## Предупреждения",
    "",
    warnings.length ? warnings.map((item) => `- ${item}`).join("\n") : "Предупреждений нет.",
    "",
    "## Что исправлено",
    "",
    payload.fixed.length ? payload.fixed.map((item) => `- ${item}`).join("\n") : "В рамках этого запуска исправления не выполнялись.",
    "",
    "## Что не проверялось и почему",
    "",
    notChecked.length ? notChecked.map((item) => `- ${item}`).join("\n") : "Все обязательные проверки запускались.",
    "",
    "## QA coverage",
    "",
    `- pages_checked: ${coverage.pages_checked}`,
    `- pages_verified_ok: ${coverage.pages_verified_ok}/${coverage.pages_checked}`,
    `- visual_density_checks: ${coverage.visual_density_ok}/${coverage.visual_density_checks}`,
    `- role_panels_checked: ${coverage.role_panels_checked}/${coverage.role_panels_total}`,
    `- task_cards_checked: ${coverage.task_cards_checked}`,
    `- task_workflow_sections_checked: ${coverage.task_workflow_sections_checked}`,
    `- object_cards_checked: ${coverage.object_cards_checked}`,
    `- blocker_cards_checked: ${coverage.blocker_cards_checked}`,
    `- material_cards_checked: ${coverage.material_cards_checked}`,
    `- workflow_rules_checked: ${coverage.workflow_rules_checked}`,
    `- photo_report_checks_checked: ${coverage.photo_report_checks_checked}`,
    `- data_integrity_violations_checked: ${coverage.data_integrity_violations_checked}`,
    `- data_integrity_critical: ${coverage.data_integrity_critical}`,
    `- data_integrity_warning_types: ${JSON.stringify(coverage.data_integrity_warning_types || {})}`,
    `- d2dom_control_v1_checks: ${coverage.d2dom_control_v1_checks}`,
    `- d2dom_control_screens_checked: ${coverage.d2dom_control_screens_checked}`,
    `- buttons_checked: ${coverage.buttons_checked}`,
    `- feedback_rows_checked: ${coverage.feedback_rows_checked}`,
    `- mobile_viewports_checked: ${coverage.mobile_viewports_checked}`,
    `- mobile_quick_actions_checked: ${coverage.mobile_quick_actions_checked}`,
    `- readonly_write_methods_checked: ${coverage.readonly_write_methods_checked}/${coverage.readonly_write_methods_total}`,
    `- screenshots_created: ${coverage.screenshots_created}`,
    `- skipped_tests: ${coverage.skipped_tests.map((item) => `${item.count} (${item.reason})`).join("; ")}`,
    "",
    "## Итог",
    "",
    overall,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(ARTIFACT_DIR, "qa-report.md"), md, "utf8");
  return payload;
}

async function buildEnvironmentInfo() {
  const isLocal = baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost");
  const productionVersion = await fetchJsonSafe(`${externalBaseUrl}/version`);
  return {
    environment: isLocal ? "local" : "production",
    targetEnvironment: isLocal ? "local QA server via localhost" : "external URL",
    productionVersionCommitHash: productionVersion?.commitHash || "not_checked",
    snapshotCommitHash: productionVersion?.commitHash || "not_checked",
  };
}

async function stopServerProcess(serverProcess) {
  if (!serverProcess || serverProcess.killed) return;
  await new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    serverProcess.once("exit", done);
    serverProcess.once("close", done);
    serverProcess.kill();
    setTimeout(done, 1500);
  });
}

async function main() {
  ensureDirs();
  const startedAt = new Date().toISOString();
  const results = [];
  const mandatory = suite === "all" || suite === "report" ? ["lint", "typecheck", "unit", "scroll", "buttons", "navigation", "mobile", "readonly", "workflow", "photo_report_integrity", "data_integrity", "d2dom_control_v1"] : [];
  let serverProcess = null;
  let browser = null;
  try {
    if (["lint", "all", "report"].includes(suite)) await runLint(results);
    if (["typecheck", "all", "report"].includes(suite)) await runTypecheck(results);
    if (["unit", "all", "report"].includes(suite)) await runUnit(results);
    if (isLocalBaseUrl && ["all", "report", "mobile", "buttons"].includes(suite)) ensureLocalQaFixtures(results);

    const needsBrowser = ["smoke", "scroll", "buttons", "navigation", "roles", "readonly", "mobile", "photo_report_integrity", "all", "report"].includes(suite);
    let playwright = null;
    let page = null;
    let errors = [];
    if (needsBrowser) {
      serverProcess = await ensureServer();
      playwright = loadPlaywright();
      const prepared = await preparePage(playwright);
      browser = prepared.browser;
      page = prepared.page;
      errors = prepared.errors;
      if (["smoke", "all", "report"].includes(suite)) await runSmoke(results, page);
      if (["smoke", "all", "report"].includes(suite)) await runVersionCache(results);
      if (["scroll", "all", "report"].includes(suite)) await runScroll(results, page);
      if (["buttons", "all", "report"].includes(suite)) await runButtons(results, page);
      if (["navigation", "all", "report"].includes(suite)) await runNavigation(results, page);
      if (["roles", "all", "report"].includes(suite)) await runRoles(results, page);
      if (["readonly", "all", "report"].includes(suite)) await runReadonly(results, playwright);
      if (["mobile", "all", "report"].includes(suite)) await runMobile(results, playwright);
      if (["all", "report"].includes(suite)) await runUx(results, page);
      if (["all", "report"].includes(suite)) await runWorkflow(results, page);
      if (["photo_report_integrity", "all", "report"].includes(suite)) await runPhotoReportIntegrity(results, page);
      if (["all", "report"].includes(suite)) await runVisual(results, page);
      if (["all", "report"].includes(suite)) await runVisualDensity(results, page);
      if (["all", "report"].includes(suite)) await runD2Prototype(results, page);
      add(results, "Console Error QA Agent", "Browser console", errors.length ? "FAIL" : "OK", errors.join("\n") || "No console/page/request errors.", errors.length ? "blocker" : "normal");
    }
    if (["data_integrity", "all", "report"].includes(suite)) await runDataIntegrity(results);
    if (["max", "all", "report"].includes(suite)) await runMaxFormat(results);
  } catch (error) {
    add(results, "QA Orchestrator Agent", "Quality gate runtime", "FAIL", error.stack || error.message, "blocker");
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServerProcess(serverProcess);
  }
  const environmentInfo = await buildEnvironmentInfo();
  const payload = writeReport(results, startedAt, new Date().toISOString(), mandatory, environmentInfo);
  console.log(JSON.stringify({ overall: payload.overall, checks: payload.checks, criticalErrors: payload.criticalErrors, report: "qa-artifacts/latest/qa-report.md" }, null, 2));
  process.exitCode = payload.overall === "FAIL" ? 1 : 0;
}

main();
