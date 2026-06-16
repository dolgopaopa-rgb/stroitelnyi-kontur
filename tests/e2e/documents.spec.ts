import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("knowledge base opens as a file manager", async ({ page }) => {
  await openApp(page, "/documents");
  await expect(page.locator("#documentCards")).toBeVisible();
});

test("document classification rules recognize media, screenshots and unknown files", async ({ page }) => {
  await openApp(page, "/documents");
  let result: { mov: string; screenshot: string; unknown: string } | null = null;
  for (let attempt = 0; attempt < 10 && !result; attempt += 1) {
    result = await page
      .evaluate(() => ({
        mov: (window as any).__konturDocumentTypeKey({ type: "other", file_name: "IMG_4042.mov", mime_type: "video/quicktime" }),
        screenshot: (window as any).__konturDocumentTypeKey({ type: "other", file_name: "ошибка_экран_кнопка.png", mime_type: "image/png" }),
        unknown: (window as any).__konturDocumentTypeKey({ type: "other", file_name: "strange-file.bin", mime_type: "application/octet-stream" }),
      }))
      .catch(() => null);
    if (!result) await page.waitForTimeout(150);
  }
  expect(result).not.toBeNull();
  if (!result) throw new Error("Document classification helper was not available.");
  expect(result.mov).toBe("photo_video");
  expect(result.screenshot).toBe("service_screenshot");
  expect(result.unknown).toBe("unclassified");
});
