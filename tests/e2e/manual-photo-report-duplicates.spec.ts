import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { openApp } from "../helpers/auth";

test("Data Integrity Agent detects manual duplicate photo reports without auto-fix", async ({ page }, testInfo) => {
  const remoteBase = process.env.KONTUR_BASE_URL || "";
  test.skip(Boolean(remoteBase && !remoteBase.includes("127.0.0.1") && !remoteBase.includes("localhost")), "local DB fixture test is skipped for remote production targets");

  const marker = `QA A3 manual duplicate ${Date.now()}`;
  const setup = spawnSync(
    "python",
    [
      "-c",
      `
import sys
sys.path.insert(0, "app")
from database import init_db, connect

init_db()
with connect() as db:
    project = db.execute("SELECT id FROM projects WHERE status != 'archived' ORDER BY id LIMIT 1").fetchone()
    author = db.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
    if not project or not author:
        raise SystemExit("missing project or author")
    for index in range(2):
        db.execute(
            """
            INSERT INTO photo_reports (
                project_id, report_date, author_id, task_id, stage, zones, comment, related_task_ids, files_count, status
            )
            VALUES (?, date('now'), ?, NULL, 'QA A3', 'Integrity', ?, '[]', 1, 'review')
            """,
            (project["id"], author["id"], "${marker}"),
        )
    db.commit()
print("ok")
`,
    ],
    { encoding: "utf8" }
  );
  expect(setup.status, setup.stderr || setup.stdout).toBe(0);

  await openApp(page, "/settings");
  const report = await page.evaluate(async () => {
    const response = await fetch("/api/data-integrity", { cache: "no-store" });
    return response.json();
  });
  const duplicateViolations = (report.violations || []).filter((item: any) => item.violation_type === "manual_photo_report_duplicate");
  expect(duplicateViolations.length).toBeGreaterThan(0);
  expect(duplicateViolations.some((item: any) => item.auto_fix_safe === false)).toBeTruthy();
  testInfo.annotations.push({ type: "a3-fixture", description: marker });
});
