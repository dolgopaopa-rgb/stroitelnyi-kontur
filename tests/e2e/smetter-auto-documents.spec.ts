import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";


test("project card explains automatic Smetter import without required Excel files", async ({ page }) => {
  await openApp(page, "/objects");
  await page.evaluate(() => {
    const dialog = document.querySelector("#projectDialog") as HTMLDialogElement | null;
    if (dialog && !dialog.open) dialog.showModal();
  });

  const dialog = page.locator("#projectDialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Автоматическая передача из Сметтера");
  await expect(dialog).toContainText("задание на работы и перечень материалов через API");

  const smetterLink = dialog.locator('input[name="smetter_ref"]');
  const materialFile = dialog.locator('input[name="estimate_file_name"]');
  const workFile = dialog.locator('input[name="work_task_file"]');
  await expect(smetterLink).toHaveAttribute("required", "");
  await expect(materialFile).not.toHaveAttribute("required", "");
  await expect(workFile).not.toHaveAttribute("required", "");

  const layout = await dialog.evaluate((node) => ({
    dialogOverflow: node.scrollWidth > node.clientWidth + 2,
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  }));
  expect(layout.dialogOverflow).toBe(false);
  expect(layout.pageOverflow).toBe(false);
});
