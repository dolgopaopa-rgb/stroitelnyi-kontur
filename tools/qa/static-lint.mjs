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

const failures = checks.filter((item) => item.status === "FAIL");
console.log(JSON.stringify({ overall: failures.length ? "FAIL" : "PASS", checks }, null, 2));
process.exit(failures.length ? 1 : 0);
