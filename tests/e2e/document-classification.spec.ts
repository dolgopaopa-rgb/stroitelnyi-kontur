import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/auth";

test("document classifier is available in browser", async ({ page }) => {
  await openApp(page, "/documents");
  await page.waitForFunction(() => typeof (window as any).__konturDocumentTypeKey === "function");
  const labels = await page.evaluate(() => {
    const fn = (window as any).__konturDocumentTypeKey;
    return [fn?.({ file_name: "IMG_4042.mov", mime_type: "video/quicktime" }), fn?.({ file_name: "skrin_oshibka.png", mime_type: "image/png" })];
  });
  expect(labels).toEqual(["photo_video", "service_screenshot"]);
});
