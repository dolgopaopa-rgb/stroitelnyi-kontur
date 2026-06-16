import { expect, Page } from "@playwright/test";

const pathToViewId: Record<string, string> = {
  "/today": "todayView",
  "/objects": "projectsView",
  "/tasks": "tasksView",
  "/materials": "materialsView",
  "/photo-reports": "photosView",
  "/object-issues": "object_remarksView",
  "/documents": "documentsView",
  "/signals": "dashboardView",
  "/feedback": "feedbackView",
  "/settings": "eventsView",
};

export async function openApp(page: Page, path = "/today") {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  if (await page.locator("#loginForm").count()) {
    const login = process.env.KONTUR_E2E_USER || process.env.KONTUR_BASIC_USER;
    const password = process.env.KONTUR_E2E_PASSWORD || process.env.KONTUR_BASIC_PASSWORD;
    if (!login || !password) {
      throw new Error("Login page opened, but KONTUR_E2E_USER/KONTUR_E2E_PASSWORD are not configured.");
    }
    await page.locator('input[name="login"]').fill(login);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState("domcontentloaded");
  }
  await expect(page.locator("body")).not.toHaveText("");
  const viewId = pathToViewId[path.split("?")[0]];
  if (viewId) {
    await expect(page.locator(`#${viewId}`)).toHaveClass(/active/);
  }
}

export async function switchRole(page: Page, role: string) {
  const select = page.locator("#currentRoleSelect");
  if (!(await select.count())) return false;
  const values = await select.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  if (!values.includes(role)) return false;
  await select.selectOption(role);
  await page.waitForTimeout(250);
  return true;
}
