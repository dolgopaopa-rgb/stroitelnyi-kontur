import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { openApp } from "../helpers/auth";

test("Data Integrity Agent flags accepted task only with explicit execution-overdue marker", async ({ page }) => {
  const remoteBase = process.env.KONTUR_BASE_URL || "";
  test.skip(Boolean(remoteBase && !remoteBase.includes("127.0.0.1") && !remoteBase.includes("localhost")), "local DB fixture test is skipped for remote production targets");

  const python = process.env.PYTHON || "python";
  const marker = `QA accepted overdue ${Date.now()}`;
  const setupScript = `
import json
import sys
sys.path.insert(0, "app")
from database import init_db, connect

marker = ${JSON.stringify(marker)}
init_db()
with connect() as db:
    columns = {row["name"] for row in db.execute("PRAGMA table_info(tasks)").fetchall()}
    if "is_execution_overdue" not in columns:
        db.execute("ALTER TABLE tasks ADD COLUMN is_execution_overdue INTEGER NOT NULL DEFAULT 0")
    project = db.execute("SELECT id FROM projects WHERE status != 'archived' ORDER BY id LIMIT 1").fetchone()
    user = db.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
    if not project or not user:
        raise SystemExit("missing project or user")
    clean = db.execute(
        """
        INSERT INTO tasks (
            project_id, title, assignee_id, due_date, status, priority, accepted_at, is_execution_overdue
        )
        VALUES (?, ?, ?, date('now', '-30 day'), 'accepted', 'normal', CURRENT_TIMESTAMP, 0)
        """,
        (project["id"], marker + " clean", user["id"]),
    ).lastrowid
    flagged = db.execute(
        """
        INSERT INTO tasks (
            project_id, title, assignee_id, due_date, status, priority, accepted_at, is_execution_overdue
        )
        VALUES (?, ?, ?, date('now', '-30 day'), 'accepted', 'normal', CURRENT_TIMESTAMP, 1)
        """,
        (project["id"], marker + " flagged", user["id"]),
    ).lastrowid
    db.commit()
print(json.dumps({"clean": clean, "flagged": flagged}))
`;
  const setup = spawnSync(python, ["-c", setupScript], { encoding: "utf8" });
  expect(setup.status, setup.stderr || setup.stdout).toBe(0);
  const ids = JSON.parse(setup.stdout.trim());

  try {
    await openApp(page, "/settings");
    const report = await page.evaluate(async () => {
      const response = await fetch("/api/data-integrity", { cache: "no-store" });
      return response.json();
    });
    const acceptedOverdue = (report.violations || []).filter((item: any) => item.violation_type === "accepted_task_in_overdue");
    expect(acceptedOverdue.some((item: any) => Number(item.entity_id) === Number(ids.clean))).toBeFalsy();
    expect(acceptedOverdue.some((item: any) => Number(item.entity_id) === Number(ids.flagged))).toBeTruthy();
    expect(report.warning_counts_by_type?.accepted_task_in_overdue || 0).toBeGreaterThan(0);
  } finally {
    const cleanupScript = `
import sys
sys.path.insert(0, "app")
from database import init_db, connect
ids = [${Number(ids.clean)}, ${Number(ids.flagged)}]
init_db()
with connect() as db:
    db.execute("DELETE FROM tasks WHERE id IN (?, ?)", ids)
    db.commit()
`;
    spawnSync(python, ["-c", cleanupScript], { encoding: "utf8" });
  }
});
