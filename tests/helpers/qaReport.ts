import fs from "node:fs";
import path from "node:path";

export function latestQaReport() {
  const file = path.resolve("qa-artifacts/latest/qa-report.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}
