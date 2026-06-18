#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const pythonFiles = ["app/server.py", "app/database.py", "tools/kontur_quality_agent.py", "tools/kontur_agent_suite.py"];
const jsFiles = ["app/static/app.js", "app/static/app.compat.js", "src/notifications/max/formatMaxReport.mjs", "tools/qa/run-quality-gate.mjs", "tools/qa/max-report-cli.mjs"];

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: process.platform === "win32" });
  return { code: result.status || 0, output: `${result.stdout || ""}${result.stderr || ""}`.trim() };
}

const checks = [];
const py = run("python", ["-m", "py_compile", ...pythonFiles]);
checks.push({ name: "Python syntax", status: py.code === 0 ? "OK" : "FAIL", details: py.output || "ok" });

for (const file of jsFiles) {
  if (!fs.existsSync(file)) continue;
  const result = run(process.execPath, ["--check", file]);
  checks.push({ name: `JS syntax ${file}`, status: result.code === 0 ? "OK" : "FAIL", details: result.output || "ok" });
}

const serverText = fs.readFileSync("app/server.py", "utf8");
const appText = fs.readFileSync("app/static/app.js", "utf8");
function roleRuleHas(text, rolePattern, required) {
  const match = text.match(rolePattern);
  const body = match ? match[0] : "";
  return required.every((item) => body.includes(item));
}

const extraWorkAccessOk =
  roleRuleHas(serverText, /"foreman":\s*\{[^}]*\}/s, ["variation_attachment", "extra_work_attachment"]) &&
  roleRuleHas(serverText, /"master":\s*\{[^}]*\}/s, ["variation_attachment", "extra_work_attachment"]) &&
  roleRuleHas(appText, /foreman:\s*new Set\(\[[^\]]*\]\)/s, ["variation_attachment", "extra_work_attachment"]) &&
  roleRuleHas(appText, /master:\s*new Set\(\[[^\]]*\]\)/s, ["variation_attachment", "extra_work_attachment"]);
checks.push({
  name: "Foreman/master can open extra work attachments",
  status: extraWorkAccessOk ? "OK" : "FAIL",
  details: extraWorkAccessOk ? "variation_attachment and extra_work_attachment are allowed in server and frontend rules" : "extra work attachments are missing from foreman/master access rules",
});

const photoReportAccessOk =
  roleRuleHas(serverText, /"foreman":\s*\{[^}]*\}/s, ["photo_report", "object_remark_photo"]) &&
  roleRuleHas(serverText, /"master":\s*\{[^}]*\}/s, ["photo_report", "object_remark_photo"]) &&
  roleRuleHas(serverText, /"technical_supervisor":\s*\{[^}]*\}/s, ["photo_report", "object_remark_photo"]) &&
  roleRuleHas(appText, /foreman:\s*new Set\(\[[^\]]*\]\)/s, ["photo_report", "object_remark_photo"]) &&
  roleRuleHas(appText, /master:\s*new Set\(\[[^\]]*\]\)/s, ["photo_report", "object_remark_photo"]) &&
  roleRuleHas(appText, /technical_supervisor:\s*new Set\(\[[^\]]*\]\)/s, ["photo_report", "object_remark_photo"]);
checks.push({
  name: "Field roles can open photo report media",
  status: photoReportAccessOk ? "OK" : "FAIL",
  details: photoReportAccessOk ? "photo_report and object_remark_photo are allowed for field roles in server and frontend rules" : "photo report media access is missing for a field role",
});

const failures = checks.filter((item) => item.status === "FAIL");
console.log(JSON.stringify({ overall: failures.length ? "FAIL" : "PASS", checks }, null, 2));
process.exit(failures.length ? 1 : 0);
