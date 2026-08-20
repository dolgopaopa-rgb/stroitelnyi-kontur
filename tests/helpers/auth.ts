import { expect, Page } from "@playwright/test";

const pathToViewId: Record<string, string> = {
  "/today": "todayView",
  "/objects": "projectsView",
  "/estimates": "estimatesView",
  "/tasks": "tasksView",
  "/materials": "materialsView",
  "/photo-reports": "photosView",
  "/object-issues": "object_remarksView",
  "/documents": "documentsView",
  "/signals": "dashboardView",
  "/feedback": "feedbackView",
  "/settings": "eventsView",
};

const pathToNavId: Record<string, string> = {
  "/today": "nav-today",
  "/objects": "nav-objects",
  "/estimates": "nav-estimates",
  "/tasks": "nav-tasks",
  "/materials": "nav-materials",
  "/photo-reports": "nav-photo-reports",
  "/object-issues": "nav-object-issues",
  "/documents": "nav-documents",
  "/signals": "nav-signals",
  "/feedback": "nav-feedback",
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
    const view = page.locator(`#${viewId}`);
    await page.waitForTimeout(250);
    if (!(await view.evaluate((node) => node.classList.contains("active")).catch(() => false))) {
      const navId = pathToNavId[path.split("?")[0]];
      const nav = navId ? page.locator(`[data-testid="${navId}"]`).first() : null;
      if (nav && (await nav.count()) && (await nav.isVisible().catch(() => false))) {
        await nav.click();
      }
    }
    await expect(view).toHaveClass(/active/);
  }
}

export async function switchRole(page: Page, role: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const select = page.locator("#currentRoleSelect");
      if (!(await select.count())) return false;
      const values = await select.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
      if (!values.includes(role)) return false;
      await select.selectOption(role);
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      await page.waitForTimeout(250);
      return true;
    } catch (error) {
      if (!String(error).includes("Execution context was destroyed") || attempt === 2) throw error;
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      await page.waitForTimeout(250);
    }
  }
  return false;
}
