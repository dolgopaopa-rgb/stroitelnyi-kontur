#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { formatMaxReport, validateMaxReport } from "../../src/notifications/max/formatMaxReport.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const reportPath = arg("--report", "qa-artifacts/latest/qa-report.json");
const task = arg("--task", "");
const nextStep = arg("--next-step", "");
const preset = arg("--preset", "");
const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, "utf8")) : {};

const presets = {
  "audit-login-fix": {
    task: "Исправили внешний режим аудита и убрали UX-хвосты в проверочном snapshot.",
    done: [
      "Внешний audit-login теперь сразу открывает Контур в режиме просмотра без ручного логина.",
      "Режим ИИ-аудитора остаётся только для просмотра: создание, удаление и изменение данных запрещены.",
      "В snapshot приоритеты задач показываются по-русски, без служебного normal.",
      "Длинные задачи в snapshot укорочены, статус и приоритет отделены от названия.",
      "Повторяющиеся сигналы сгруппированы и не выводятся одинаковым текстом подряд.",
      "Отправка MAX-отчётов защищена от битой кириллицы с вопросительными знаками.",
    ],
    artifacts: [
      "qa-report.md обновлён",
      "snapshot QA status: PASS",
      "/version показывает актуальную версию",
      "внешний audit-login проверен в свежем браузере",
    ],
    nextStep: "Можно отдавать внешний read-only доступ аудитору и продолжать UX-доработки уже под контролем QA.",
  },
  "qa-consistency-audit-status": {
    task: "Сверили commitHash, уточнили статус внешнего audit-login и убрали повторяющиеся сигналы.",
    done: [
      "Snapshot теперь показывает productionCommitHash и qaRunCommitHash отдельно.",
      "Read-only QA разделён на Playwright fresh browser context и внешний cookie-limited viewer.",
      "Внешний просмотрщик без cookie/session помечается как PARTIAL / unsupported с понятной причиной.",
      "Сигналы по одинаковым событиям больше не повторяют один и тот же текст подряд.",
      "Добавлен тест группировки сигналов на четыре одинаковых уведомления.",
    ],
    artifacts: [
      "qa-report.md обновлён",
      "snapshot показывает текущий production commitHash",
      "/version показывает текущую production-версию",
      "live audit-login в свежем браузере проверен",
      "external cookie-limited viewer зафиксирован как PARTIAL / unsupported",
    ],
    nextStep: "Для внешнего AI-аудитора использовать snapshot или полноценный браузер с cookie; cookieless-просмотрщик потребует отдельного режима.",
  },
};

const summary = report.maxReport || {
  task,
  done: report.done || ["Обновлён QA-контур проекта."],
  checks: report.checks || {},
  problems: report.criticalErrors || [],
  notChecked: report.notChecked || [],
  artifacts: [
    path.normalize("qa-artifacts/latest/qa-report.md"),
    path.normalize("qa-artifacts/latest/qa-report.json"),
    path.normalize("qa-artifacts/latest/screenshots"),
    path.normalize("qa-artifacts/latest/traces"),
  ],
  result: report.overall || "PARTIAL",
  nextStep,
};

if (preset && presets[preset]) Object.assign(summary, presets[preset]);
if (task) summary.task = task;
if (nextStep) summary.nextStep = nextStep;
summary.checks = report.checks || summary.checks || {};
summary.problems = report.criticalErrors || summary.problems || [];
summary.notChecked = report.notChecked || summary.notChecked || [];
summary.result = report.overall || summary.result || "PARTIAL";
const reportCommitHash = report.qaRunCommitHash || report.commit || "";
if (reportCommitHash) {
  const artifacts = summary.artifacts || [];
  if (!artifacts.some((item) => String(item).includes(String(reportCommitHash)))) {
    summary.artifacts = [...artifacts, `commitHash: ${reportCommitHash}`];
  }
}

const message = formatMaxReport(summary);
const validation = validateMaxReport(message);
if (!validation.ok) {
  console.error(JSON.stringify(validation, null, 2));
  process.exit(1);
}
process.stdout.write(message);
