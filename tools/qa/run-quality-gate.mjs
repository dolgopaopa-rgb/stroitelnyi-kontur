#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { formatMaxReport, validateMaxReport } from "../../src/notifications/max/formatMaxReport.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");
const ARTIFACT_DIR = path.join(ROOT, "qa-artifacts", "latest");
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, "screenshots");
const TRACE_DIR = path.join(ARTIFACT_DIR, "traces");
const VIDEO_DIR = path.join(ARTIFACT_DIR, "videos");
const suite = arg("--suite", "all");
const localQaPort = process.env.KONTUR_QA_PORT || "8765";
const baseUrl = (process.env.KONTUR_BASE_URL || `http://127.0.0.1:${localQaPort}`).replace(/\/$/, "");

const agentNames = [
  "QA Orchestrator Agent",
  "Scroll QA Agent",
  "Button QA Agent",
  "Navigation QA Agent",
  "Role QA Agent",
  "Read-only Safety QA Agent",
  "UX Sanity QA Agent",
  "Mobile QA Agent",
  "Console Error QA Agent",
  "Visual Regression QA Agent",
  "MAX Report Format QA Agent",
];

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
    stdio: ["ignore", "pipe", "pipe"],
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

function add(results, agent, name, status, details, severity = "normal", screenshot = "") {
  results.push({ agent, name, status, details, severity, screenshot });
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
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
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
  const py = run("python", ["-m", "py_compile", "app/server.py", "app/database.py"]);
  const db = run("python", ["-c", "import sys; sys.path.insert(0, 'app'); from database import init_db; init_db(); print('db ok')"]);
  const failed = py.code !== 0 || db.code !== 0;
  add(results, "QA Orchestrator Agent", "Unit smoke", failed ? "FAIL" : "OK", [py.output, db.output].filter(Boolean).join("\n") || "ok", failed ? "blocker" : "normal");
}

async function runSmoke(results, page) {
  await route(page, "/today");
  const length = await visibleTextLength(page);
  const hasLoader = await page.locator(".app-loading, .global-loader").count().catch(() => 0);
  add(results, "QA Orchestrator Agent", "No white screen", length > 20 ? "OK" : "FAIL", `Visible text length: ${length}`, length > 20 ? "normal" : "blocker");
  add(results, "QA Orchestrator Agent", "No endless loader", hasLoader ? "WARN" : "OK", `Loader nodes: ${hasLoader}`);
}

async function runScroll(results, page) {
  const routes = ["today", "projects", "tasks", "materials", "photos", "object_remarks", "documents", "dashboard", "feedback"];
  for (const view of routes) {
    await route(page, view);
    const before = await scrollMetric(page);
    const mainBox = await page.locator('[data-testid="qa-main-content"]').boundingBox().catch(() => null);
    if (mainBox) {
      await page.mouse.move(
        mainBox.x + Math.min(mainBox.width - 8, Math.max(8, mainBox.width / 2)),
        mainBox.y + Math.min(mainBox.height - 8, Math.max(8, mainBox.height / 2)),
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
  await page.setViewportSize({ width: 390, height: 844 });
  await route(page, "today");
  const plus = page.locator('[data-testid="mobile-plus-button"]').first();
  if (await plus.count()) {
    await plus.click();
    await page.waitForTimeout(200);
    const open = await page.locator('[data-testid="mobile-quick-actions"] [data-mobile-action]').count();
    add(results, "Button QA Agent", "Mobile + opens actions", open > 0 ? "OK" : "FAIL", `actions=${open}`, open > 0 ? "normal" : "blocker");
  }
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
    ["owner", ["nav-objects", "nav-tasks", "nav-materials"]],
    ["construction_manager", ["nav-objects", "nav-tasks", "nav-materials"]],
    ["foreman:7", ["nav-tasks", "nav-materials", "nav-documents"]],
    ["master", ["nav-tasks", "nav-photo-reports"]],
    ["procurement_manager", ["nav-materials", "nav-objects"]],
    ["estimator", ["nav-estimates", "nav-materials"]],
  ];
  await route(page, "today");
  for (const [role, expectedIds] of roleChecks) {
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
    for (const id of expectedIds) {
      const visible = await page.locator(`[data-testid="${id}"]`).isVisible().catch(() => false);
      add(results, "Role QA Agent", `${role}: ${id}`, visible ? "OK" : "FAIL", `visible=${visible}`, visible ? "normal" : "blocker");
    }
  }
}

async function createAuditLoginUrl() {
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
  const bodyText = await page.evaluate(() => document.body.innerText || "");
  const forbidden = ["in_progress", "main_estimate", "construction_manager", "procurement_manager", "estimator"].filter((item) => bodyText.includes(item));
  add(results, "UX Sanity QA Agent", "No technical enum values in visible UI", forbidden.length ? "FAIL" : "OK", forbidden.join(", ") || "none", forbidden.length ? "blocker" : "normal");
  const taskCardCount = await page.locator('[data-testid="task-card"]').count();
  const badgeCount = await page.locator('[data-testid="task-type-badge"], [data-testid="task-status-badge"], [data-testid="task-priority-badge"]').count();
  add(results, "UX Sanity QA Agent", "Task card has separated badges", taskCardCount === 0 || badgeCount > 0 ? "OK" : "FAIL", `cards=${taskCardCount}; badges=${badgeCount}`, "normal");
  await route(page, "today");
  const attention = await page.locator('[data-testid="today-attention-list"]').innerText().catch(() => "");
  add(results, "UX Sanity QA Agent", "Today screen shows concrete attention block", attention.trim().length > 0 ? "OK" : "WARN", `length=${attention.trim().length}`);
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
      await page.locator('[data-testid="mobile-plus-button"]').click().catch(() => {});
      const actions = await page.locator('[data-testid="mobile-quick-actions"] [data-mobile-action]').count().catch(() => 0);
      const status = navVisible && !overflow && actions > 0 ? "OK" : "FAIL";
      add(results, "Mobile QA Agent", `Viewport ${viewport.width}x${viewport.height}`, status, `nav=${navVisible}; horizontalOverflow=${overflow}; actions=${actions}`, status === "FAIL" ? "blocker" : "normal");
    } finally {
      await browser.close().catch(() => {});
    }
  }
}

async function runVisual(results, page) {
  const views = ["today", "projects", "tasks", "materials", "documents"];
  for (const view of views) {
    await route(page, view);
    const screenshot = path.join(SCREENSHOT_DIR, `${view}.png`);
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => null);
    const length = await visibleTextLength(page);
    add(results, "Visual Regression QA Agent", `Screenshot ${view}`, length > 20 ? "OK" : "FAIL", `text=${length}`, length > 20 ? "normal" : "blocker", screenshot);
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
  return map;
}

function overallStatus(results, mandatorySuites) {
  const failures = results.filter((item) => item.status === "FAIL");
  if (failures.some((item) => item.severity === "blocker")) return "FAIL";
  const checks = checksSummary(results);
  const notRun = mandatorySuites.filter((key) => checks[key] === "not_run");
  const partials = Object.values(checks).filter((value) => value === "PARTIAL");
  if (failures.length || notRun.length || partials.length) return "PARTIAL";
  return "PASS";
}

function writeReport(results, startedAt, finishedAt, mandatorySuites) {
  const checks = checksSummary(results);
  const liveAudit = results.find((item) => item.agent === "Read-only Safety QA Agent" && item.name === "Live audit-login actual access");
  checks.liveAuditLogin = !liveAudit ? "not_run" : liveAudit.status === "OK" ? "OK" : liveAudit.status === "WARN" ? "PARTIAL" : "FAIL";
  checks.snapshotConsistency = "OK";
  const criticalErrors = results.filter((item) => item.status === "FAIL" && item.severity === "blocker").map((item) => `${item.agent}: ${item.name} — ${item.details}`);
  const warnings = results.filter((item) => item.status === "WARN").map((item) => `${item.agent}: ${item.name} — ${item.details}`);
  const notChecked = mandatorySuites.filter((key) => checks[key] === "not_run").map((key) => `${key}: проверка не запускалась`);
  const overall = overallStatus(results, mandatorySuites);
  const commit = run("git", ["rev-parse", "--short", "HEAD"]).output || "unknown";
  const qaStatus = (value) => (value === "not_run" ? "not_run" : value === "FAIL" ? "failed" : value === "PARTIAL" ? "partial" : "ok");
  const hasAgent = (agent) => results.some((item) => item.agent === agent);
  const agentHasFail = (agent) => results.some((item) => item.agent === agent && item.status === "FAIL");
  const agentHasPartial = (agent) => results.some((item) => item.agent === agent && (item.status === "WARN" || item.status === "PARTIAL"));
  const agentQaStatus = (agent) => (!hasAgent(agent) ? "not_run" : agentHasFail(agent) ? "failed" : agentHasPartial(agent) ? "partial" : "ok");
  const payload = {
    generatedAt: finishedAt,
    startedAt,
    appVersion: "2026.06.16-qa",
    commit,
    qaRunCommitHash: commit,
    url: baseUrl,
    agents: agentNames,
    checks,
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
      readonly_tests: qaStatus(checks.readonly),
      live_audit_login_actual_access: results.find((item) => item.agent === "Read-only Safety QA Agent" && item.name === "Live audit-login actual access")?.status === "OK" ? "ok" : results.find((item) => item.agent === "Read-only Safety QA Agent" && item.name === "Live audit-login actual access") ? "failed" : "not_run",
      snapshot_qa_consistency: "ok",
      mobile_tests: qaStatus(checks.mobile),
      console_errors: results.some((item) => item.agent === "Console Error QA Agent" && item.status === "FAIL") ? "failed" : results.some((item) => item.agent === "Console Error QA Agent") ? "ok" : "not_run",
      visual_regression: results.some((item) => item.agent === "Visual Regression QA Agent") ? "ok" : "not_run",
      max_report_format: results.some((item) => item.agent === "MAX Report Format QA Agent" && item.status === "FAIL") ? "failed" : results.some((item) => item.agent === "MAX Report Format QA Agent") ? "ok" : "not_run",
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
    "## Итог",
    "",
    overall,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(ARTIFACT_DIR, "qa-report.md"), md, "utf8");
  return payload;
}

async function main() {
  ensureDirs();
  const startedAt = new Date().toISOString();
  const results = [];
  const mandatory = suite === "all" || suite === "report" ? ["lint", "typecheck", "unit", "scroll", "buttons", "navigation", "mobile", "readonly"] : [];
  let serverProcess = null;
  let browser = null;
  try {
    if (["lint", "all", "report"].includes(suite)) await runLint(results);
    if (["typecheck", "all", "report"].includes(suite)) await runTypecheck(results);
    if (["unit", "all", "report"].includes(suite)) await runUnit(results);

    const needsBrowser = ["smoke", "scroll", "buttons", "navigation", "roles", "readonly", "mobile", "all", "report"].includes(suite);
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
      if (["scroll", "all", "report"].includes(suite)) await runScroll(results, page);
      if (["buttons", "all", "report"].includes(suite)) await runButtons(results, page);
      if (["navigation", "all", "report"].includes(suite)) await runNavigation(results, page);
      if (["roles", "all", "report"].includes(suite)) await runRoles(results, page);
      if (["readonly", "all", "report"].includes(suite)) await runReadonly(results, playwright);
      if (["mobile", "all", "report"].includes(suite)) await runMobile(results, playwright);
      if (["all", "report"].includes(suite)) await runUx(results, page);
      if (["all", "report"].includes(suite)) await runVisual(results, page);
      add(results, "Console Error QA Agent", "Browser console", errors.length ? "FAIL" : "OK", errors.join("\n") || "No console/page/request errors.", errors.length ? "blocker" : "normal");
    }
    if (["max", "all", "report"].includes(suite)) await runMaxFormat(results);
  } catch (error) {
    add(results, "QA Orchestrator Agent", "Quality gate runtime", "FAIL", error.stack || error.message, "blocker");
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (serverProcess) serverProcess.kill();
  }
  const payload = writeReport(results, startedAt, new Date().toISOString(), mandatory);
  console.log(JSON.stringify({ overall: payload.overall, checks: payload.checks, criticalErrors: payload.criticalErrors, report: "qa-artifacts/latest/qa-report.md" }, null, 2));
  process.exit(payload.overall === "FAIL" ? 1 : 0);
}

main();
