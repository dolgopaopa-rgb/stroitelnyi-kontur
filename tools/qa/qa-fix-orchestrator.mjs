#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const QA_REPORT_DIR = path.join(ROOT, "qa-reports");
const QA_SNAPSHOT_DIR = path.join(ROOT, "qa-snapshots");
const QA_ARTIFACT_DIR = path.join(ROOT, "qa-artifacts", "latest");

const DANGEROUS_ZONES = [
  "База данных и схема таблиц",
  "Авторизация и сессии",
  "Роли и права пользователей",
  "API-контракты",
  "Деплой, домены и production-публикация",
  "Токены, ключи и секреты",
  "Удаление крупных разделов или бизнес-логики",
];

const AGENTS = [
  {
    name: "Lead QA Fix Architect",
    checks: ["координация проверок", "разделение safe/dangerous", "итоговый отчёт"],
    safeFixes: ["создание QA-директорий", "синхронизация отчётов", "запуск quality gate"],
  },
  {
    name: "Code Review Fix Agent",
    checks: ["lint", "typecheck", "мелкие ошибки кода"],
    safeFixes: ["неиспользуемые импорты", "очевидные null/undefined guards", "мелкие ошибки импортов"],
  },
  {
    name: "Frontend QA Fix Agent",
    checks: ["страницы", "кнопки", "формы", "модалки", "адаптивность"],
    safeFixes: ["битые обработчики", "внутренние ссылки", "модалки", "горизонтальный скролл"],
  },
  {
    name: "UI Consistency Fix Agent",
    checks: ["кнопки", "карточки", "формы", "отступы", "disabled/hover"],
    safeFixes: ["размеры однотипных элементов", "отступы", "радиусы", "состояния форм"],
  },
  {
    name: "UX Fix Agent",
    checks: ["подписи", "loading/error/success", "empty states", "кликабельные зоны"],
    safeFixes: ["понятные подписи", "состояния загрузки", "пустые состояния"],
  },
  {
    name: "Regression Fix Agent",
    checks: ["auth", "объекты", "задачи", "материалы", "документы", "мобильная версия"],
    safeFixes: ["локализация файла регрессии", "точечный frontend-fix"],
  },
  {
    name: "Playwright E2E Agent",
    checks: ["smoke", "navigation", "forms", "mobile", "screenshots"],
    safeFixes: ["стабильные selectors", "test fixtures", "mock/e2e режим без реальных данных"],
  },
  {
    name: "Accessibility Fix Agent",
    checks: ["labels", "aria", "focus-visible", "contrast", "tab order"],
    safeFixes: ["aria-label", "alt", "focus styles", "input labels"],
  },
  {
    name: "Performance Fix Agent",
    checks: ["тяжёлые импорты", "лишний код", "lazy loading", "шрифты"],
    safeFixes: ["простые lazy/defer правки", "удаление очевидно неиспользуемого UI-кода"],
  },
  {
    name: "Security Check Agent",
    checks: ["secrets", "console.log sensitive data", "target blank", "XSS UI risk"],
    safeFixes: ["rel=noopener noreferrer", "убрать чувствительный console.log", "безопасный текст ошибок"],
  },
  {
    name: "Visual Snapshot Agent",
    checks: ["390x844", "768x1024", "1280x720", "1440x900", "1920x1080"],
    safeFixes: ["фиксация screenshots", "поиск белого экрана и сломанной вёрстки"],
  },
];

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function run(command, args, options = {}) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: ROOT,
    shell: false,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
  return {
    command: [command, ...args].join(" "),
    code: typeof result.status === "number" ? result.status : 1,
    durationMs: Date.now() - startedAt,
    output: `${result.stdout || ""}${result.stderr || ""}`.trim(),
  };
}

function runQualitySuite(suite) {
  return run(process.execPath, ["tools/qa/run-quality-gate.mjs", "--suite", suite]);
}

function runStaticLint() {
  return run(process.execPath, ["tools/qa/static-lint.mjs"]);
}

function ensureDir(dir, fixed) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    fixed.push(`Создана директория: ${path.relative(ROOT, dir)}`);
  }
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function getGitCommit() {
  const result = run("git", ["rev-parse", "--short", "HEAD"]);
  return result.code === 0 ? result.output.split(/\s+/)[0] : "unknown";
}

function scriptExists(packageJson, scriptName) {
  return Boolean(packageJson?.scripts?.[scriptName]);
}

function validatePackageScripts(fixed, dangerous) {
  const packagePath = path.join(ROOT, "package.json");
  const packageJson = readJson(packagePath);
  if (!packageJson) {
    dangerous.push("package.json не прочитан. Нужна ручная проверка npm-скриптов.");
    return;
  }

  const required = {
    qa: "node tools/qa/qa-fix-orchestrator.mjs --fix --full",
    "qa:e2e": "npm run test:qa:e2e",
    "qa:snapshots": "node tools/qa/visual-snapshots.mjs",
    "qa:report": "node scripts/generate-qa-report.js",
  };

  const missing = Object.keys(required).filter((name) => !scriptExists(packageJson, name));
  if (!missing.length) return;

  dangerous.push(
    `В package.json отсутствуют npm-скрипты: ${missing.join(", ")}. ` +
      "Это безопасно исправляется патчем, но текущий запуск не редактирует JSON автоматически.",
  );
}

function copyLatestQaArtifactReport(fixed, warnings) {
  const artifactMd = path.join(QA_ARTIFACT_DIR, "qa-report.md");
  const artifactJson = path.join(QA_ARTIFACT_DIR, "qa-report.json");
  const targetMd = path.join(QA_REPORT_DIR, "latest-report.md");
  const targetJson = path.join(QA_REPORT_DIR, "latest-report.json");

  if (fs.existsSync(artifactMd)) {
    fs.copyFileSync(artifactMd, targetMd);
    fixed.push("Скопирован актуальный qa-artifacts/latest/qa-report.md в qa-reports/latest-report.md");
  } else {
    warnings.push("qa-artifacts/latest/qa-report.md пока отсутствует. Сначала запустите full QA.");
  }

  if (fs.existsSync(artifactJson)) {
    fs.copyFileSync(artifactJson, targetJson);
    fixed.push("Скопирован актуальный qa-artifacts/latest/qa-report.json в qa-reports/latest-report.json");
  }
}

function safeWorkspaceFixes() {
  const fixed = [];
  ensureDir(QA_REPORT_DIR, fixed);
  ensureDir(QA_SNAPSHOT_DIR, fixed);
  ensureDir(QA_ARTIFACT_DIR, fixed);
  return fixed;
}

function formatStatus(status) {
  if (status === "OK") return "✅ OK";
  if (status === "CRITICAL") return "❌ CRITICAL";
  return "⚠ WARNING";
}

function commandLine(command) {
  return `- \`${command.command}\` → exit ${command.code}, ${Math.round(command.durationMs / 100) / 10}s`;
}

function buildReport({ status, checked, found, fixed, dangerous, manual, commands, commitHash, generatedAt }) {
  return [
    "# QA Fix Report",
    "",
    "## Общий статус",
    "",
    formatStatus(status),
    "",
    `- generatedAt: ${generatedAt}`,
    `- commitHash: ${commitHash}`,
    "- production deploy: не выполнялся",
    "",
    "## Что было проверено",
    "",
    ...checked.map((item) => `- ${item}`),
    "",
    "## Что было найдено",
    "",
    ...(found.length ? found.map((item) => `- ${item}`) : ["- Критических проблем не найдено на выполненном наборе проверок."]),
    "",
    "## Что исправлено автоматически",
    "",
    ...(fixed.length ? fixed.map((item) => `- ${item}`) : ["- Автоматические исправления не требовались."]),
    "",
    "## Что требует подтверждения владельца",
    "",
    ...(dangerous.length ? dangerous.map((item) => `- ${item}`) : ["- Опасных изменений не требуется."]),
    "",
    "## Что осталось проверить вручную",
    "",
    ...(manual.length ? manual.map((item) => `- ${item}`) : ["- Ручная проверка не требуется для выполненного локального QA-цикла."]),
    "",
    "## Запущенные команды",
    "",
    ...(commands.length ? commands.map(commandLine) : ["- Команды не запускались."]),
    "",
    "## Как запустить проверку",
    "",
    "```bash",
    "npm run qa",
    "npm run qa:e2e",
    "npm run qa:snapshots",
    "npm run qa:report",
    "```",
    "",
    "## Агентная модель",
    "",
    ...AGENTS.map((agent) => `- ${agent.name}: проверки — ${agent.checks.join(", ")}; safe-fix — ${agent.safeFixes.join(", ")}`),
    "",
    "## Запрещено без подтверждения",
    "",
    ...DANGEROUS_ZONES.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

export function createQaFixReport({ reportOnly = false, full = false, fix = false } = {}) {
  const generatedAt = new Date().toISOString();
  const commit = getGitCommit();
  if (reportOnly) {
    ensureDir(QA_REPORT_DIR, []);
    const artifactMd = path.join(QA_ARTIFACT_DIR, "qa-report.md");
    const artifactJson = path.join(QA_ARTIFACT_DIR, "qa-report.json");
    const source = readJson(artifactJson);
    if (!source || !fs.existsSync(artifactMd)) {
      throw new Error("Полный qa-report отсутствует. Сначала запустите npm run test:qa:report.");
    }
    fs.copyFileSync(artifactMd, path.join(QA_REPORT_DIR, "latest-report.md"));
    fs.copyFileSync(artifactJson, path.join(QA_REPORT_DIR, "latest-report.json"));
    return {
      ...source,
      status: source.overall || "PARTIAL",
      commitHash: source.qaRunCommitHash || source.commit || commit,
      dangerous: [],
    };
  }
  const fixed = [];
  const found = [];
  const dangerous = [];
  const manual = [];
  const checked = [
    "структура QA-директорий",
    "наличие npm-скриптов QA",
    "существующий qa-artifacts/latest отчёт",
    "правила безопасных и опасных изменений",
  ];
  const commands = [];

  if (!reportOnly && fix) {
    fixed.push(...safeWorkspaceFixes());
  } else {
    ensureDir(QA_REPORT_DIR, fixed);
  }

  const warnings = [];
  if (!reportOnly) {
    validatePackageScripts(fixed, dangerous);
  }

  if (!reportOnly && fix) {
    copyLatestQaArtifactReport(fixed, warnings);
  }
  found.push(...warnings);

  if (!reportOnly) {
    const lint = runStaticLint();
    commands.push(lint);
    checked.push("static lint без перезаписи qa-artifacts/latest");
    if (lint.code !== 0) found.push(`Lint завершился с ошибкой. Последние строки: ${lint.output.slice(-1200)}`);

    if (full) {
      const qa = runQualitySuite("all");
      commands.push(qa);
      checked.push("полный QA quality gate");
      if (qa.code !== 0) found.push(`Полный QA завершился с ошибкой. Последние строки: ${qa.output.slice(-1200)}`);
      copyLatestQaArtifactReport(fixed, warnings);
    }
  }

  const hasCommandFail = commands.some((item) => item.code !== 0);
  const hasDangerous = dangerous.length > 0;
  const status = hasCommandFail ? "CRITICAL" : hasDangerous || found.length ? "WARNING" : "OK";

  if (hasDangerous) {
    manual.push("Подтвердить опасные или структурные изменения перед автоматическим исправлением.");
  }
  if (!full) {
    manual.push("Для полного цикла запустить `npm run qa` или `node tools/qa/qa-fix-orchestrator.mjs --fix --full`.");
  }

  const payload = { generatedAt, commitHash: commit, status, agents: AGENTS, checked, found, fixed, dangerous, manual, commands };
  writeJson(path.join(QA_REPORT_DIR, "latest-report.json"), payload);
  fs.writeFileSync(path.join(QA_REPORT_DIR, "latest-report.md"), buildReport(payload), "utf8");
  return payload;
}

const isMain = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;

if (isMain) {
  const payload = createQaFixReport({
    reportOnly: hasFlag("--report-only"),
    full: hasFlag("--full"),
    fix: hasFlag("--fix"),
  });
  console.log(
    JSON.stringify(
      {
        status: payload.status,
        commitHash: payload.commitHash,
        report: "qa-reports/latest-report.md",
        dangerous: payload.dangerous,
      },
      null,
      2,
    ),
  );
  process.exitCode = payload.status === "CRITICAL" ? 1 : 0;
}
