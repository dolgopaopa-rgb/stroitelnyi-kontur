import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("task overdue rules separate execution and review overdue", async ({ page }) => {
  await openApp(page, "/tasks");
  await page.waitForFunction(() => typeof (window as any).__konturTaskCountsAsOverdue === "function");

  const result = await page.evaluate(() => {
    const executionOverdue = (window as any).__konturTaskCountsAsOverdue;
    const reviewOverdue = (window as any).__konturTaskReviewCountsAsOverdue;
    const yesterday = "2026-01-01";
    return {
      newExecution: executionOverdue({ status: "new", due_date: yesterday }),
      inProgressExecution: executionOverdue({ status: "in_progress", due_date: yesterday }),
      oldInProgressExecution: executionOverdue({ status: "in_progress_task", due_date: yesterday }),
      returnedExecution: executionOverdue({ status: "returned", due_date: yesterday }),
      waitingExecution: executionOverdue({ status: "waiting_check", due_date: yesterday }),
      oldWaitingExecution: executionOverdue({ status: "completed_pending_acceptance", due_date: yesterday }),
      acceptedExecution: executionOverdue({ status: "accepted", due_date: yesterday }),
      noDueExecution: executionOverdue({ status: "in_progress", due_date: "" }),
      waitingReview: reviewOverdue({ status: "waiting_check", review_due_at: yesterday }),
      oldWaitingReview: reviewOverdue({ status: "completed_pending_acceptance", review_due_at: yesterday }),
      acceptedReview: reviewOverdue({ status: "accepted", review_due_at: yesterday }),
    };
  });

  expect(result).toEqual({
    newExecution: true,
    inProgressExecution: true,
    oldInProgressExecution: true,
    returnedExecution: true,
    waitingExecution: false,
    oldWaitingExecution: false,
    acceptedExecution: false,
    noDueExecution: false,
    waitingReview: true,
    oldWaitingReview: true,
    acceptedReview: false,
  });
});
