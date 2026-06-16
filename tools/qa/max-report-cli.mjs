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
const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, "utf8")) : {};
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

if (task) summary.task = task;
if (nextStep) summary.nextStep = nextStep;

const message = formatMaxReport(summary);
const validation = validateMaxReport(message);
if (!validation.ok) {
  console.error(JSON.stringify(validation, null, 2));
  process.exit(1);
}
process.stdout.write(message);
