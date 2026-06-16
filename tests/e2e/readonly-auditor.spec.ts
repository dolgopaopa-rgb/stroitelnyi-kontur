import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";

test("ai auditor opens app in fresh read-only context and cannot mutate data", async ({ browser }) => {
  const result = spawnSync("python", ["tools/create_ai_audit_token.py", "--public-url", process.env.KONTUR_BASE_URL || "http://127.0.0.1:8765"], { encoding: "utf8" });
  const loginUrl = result.stdout.match(/login_url=(\S+)/)?.[1];
  expect(loginUrl).toBeTruthy();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(loginUrl!, { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.href.includes("audit=1") || url.pathname.includes("/login"), { timeout: 7000 }).catch(() => {});
    expect(page.url()).not.toContain("/login");
    expect(page.url()).toContain("audit=1");
    await expect(page.locator('[data-testid="today-page"]')).toBeVisible();
    const sessionResponse = await context.request.get(new URL("/api/session", page.url()).toString());
    expect(sessionResponse.status()).toBe(200);
    const session = await sessionResponse.json();
    expect(session.role).toBe("ai_auditor");
    for (const method of ["post", "put", "patch", "delete"] as const) {
      const mutateResponse = await context.request[method](new URL("/api/tasks", page.url()).toString(), method === "delete" ? {} : { data: {} });
      expect(mutateResponse.status(), `${method.toUpperCase()} /api/tasks`).toBe(403);
    }
  } finally {
    await context.close();
  }
});
