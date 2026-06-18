import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("task state aliases and next action labels are visible", async ({ page }) => {
  await openApp(page, "/tasks");
  await page.waitForFunction(() => typeof (window as any).__konturTaskStatusKey === "function");

  const aliases = await page.evaluate(() => {
    const statusKey = (window as any).__konturTaskStatusKey;
    return {
      newStatus: statusKey("new"),
      inProgress: statusKey("in_progress"),
      oldInProgress: statusKey("in_progress_task"),
      waiting: statusKey("waiting_check"),
      oldWaiting: statusKey("completed_pending_acceptance"),
      accepted: statusKey("accepted"),
    };
  });

  expect(aliases).toEqual({
    newStatus: "new",
    inProgress: "in_progress",
    oldInProgress: "in_progress",
    waiting: "waiting_check",
    oldWaiting: "waiting_check",
    accepted: "accepted",
  });

  await expect(page.locator("#tasksView")).toContainText(/Ждёт проверки|Принять в работу|Отправить на проверку|Продолжить работу|Работа завершена и принята/);
});
