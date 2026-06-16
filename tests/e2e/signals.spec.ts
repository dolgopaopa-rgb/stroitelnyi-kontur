import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("signals page opens and does not show duplicated raw enum values", async ({ page }) => {
  await openApp(page, "/signals");
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("in_progress");
  expect(text).not.toContain("construction_manager");
  const signalRows = await page.locator(".signal-row").evaluateAll((nodes) =>
    nodes.map((node) =>
      (node.textContent || "")
        .replace(/\s+/g, " ")
        .replace(/ещё \d+ позиций/g, "")
        .trim()
    )
  );
  for (let index = 2; index < signalRows.length; index += 1) {
    expect(signalRows[index]).not.toBe(signalRows[index - 1]);
    expect(signalRows[index]).not.toBe(signalRows[index - 2]);
  }
});
