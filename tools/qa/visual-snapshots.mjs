#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARTIFACT_SCREENSHOTS = path.join(ROOT, "qa-artifacts", "latest", "screenshots");
const SNAPSHOT_DIR = path.join(ROOT, "qa-snapshots");

function runQualityReport() {
  return spawnSync(process.execPath, ["tools/qa/run-quality-gate.mjs", "--suite", "report"], {
    cwd: ROOT,
    shell: false,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function hasArtifactScreenshots() {
  if (!fs.existsSync(ARTIFACT_SCREENSHOTS)) return false;
  return fs.readdirSync(ARTIFACT_SCREENSHOTS).some((entry) => entry.toLowerCase().endsWith(".png"));
}

function copyScreenshots() {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  if (!fs.existsSync(ARTIFACT_SCREENSHOTS)) return [];
  const copied = [];
  for (const entry of fs.readdirSync(ARTIFACT_SCREENSHOTS)) {
    if (!entry.toLowerCase().endsWith(".png")) continue;
    const source = path.join(ARTIFACT_SCREENSHOTS, entry);
    const target = path.join(SNAPSHOT_DIR, entry);
    fs.copyFileSync(source, target);
    copied.push(path.relative(ROOT, target));
  }
  return copied;
}

const shouldRefresh = process.argv.includes("--refresh") || process.env.KONTUR_QA_SNAPSHOT_REFRESH === "1";
const alreadyHasScreenshots = hasArtifactScreenshots();
const result = shouldRefresh || !alreadyHasScreenshots ? runQualityReport() : { status: 0, stdout: "", stderr: "" };
const copied = copyScreenshots();

console.log(
  JSON.stringify(
    {
      status: result.status === 0 ? "OK" : "FAIL",
      reportSuiteExitCode: result.status,
      source: shouldRefresh || !alreadyHasScreenshots ? "fresh-report-suite" : "existing-qa-artifacts",
      screenshotsCopied: copied.length,
      target: "qa-snapshots",
      files: copied,
    },
    null,
    2,
  ),
);

if (result.status !== 0) {
  process.stderr.write(`${result.stdout || ""}${result.stderr || ""}`);
}
process.exitCode = result.status || 0;
