import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

test("version endpoint is uncached and points to current build", async ({ request }) => {
  const expectedCommit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();

  const first = await request.get("/version");
  const second = await request.get("/version");
  const head = await request.head("/version");

  expect(first.ok()).toBeTruthy();
  expect(second.ok()).toBeTruthy();
  expect(head.ok()).toBeTruthy();

  const firstJson = await first.json();
  const secondJson = await second.json();

  expect(first.headers()["cache-control"]).toContain("no-store");
  expect(second.headers()["cache-control"]).toContain("no-store");
  expect(head.headers()["cache-control"]).toContain("no-store");
  expect(head.headers()["pragma"]).toContain("no-cache");
  expect(head.headers()["expires"]).toBe("0");
  expect(firstJson.commitHash).toBe(secondJson.commitHash);
  expect(firstJson.commitHash.startsWith(expectedCommit) || expectedCommit.startsWith(firstJson.commitHash)).toBeTruthy();
});

test("service worker never serves a stale version or health response", async ({ page, request, baseURL }) => {
  test.setTimeout(60_000);
  expect(new URL(baseURL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  const expected = await (await request.get('/version')).json();
  await page.goto('/today', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.waitForLoadState('networkidle');
  const result = await page.evaluate(async () => {
    const key = (await caches.keys()).find(key => key.startsWith('stroitelnyi-kontur-'));
    if (!key) throw new Error('The installed application cache is missing');
    const cache = await caches.open(key);
    await cache.put('/version', new Response(JSON.stringify({commitHash: 'stale-cache-build'}), {headers: {'Content-Type': 'application/json'}}));
    await cache.put('/health', new Response('stale health response', {status: 503}));
    const version = await (await fetch('/version', {cache: 'no-store'})).json();
    const health = await fetch('/health', {cache: 'no-store'});
    return {version, healthStatus: health.status};
  });
  expect(result.version.commitHash).toBe(expected.commitHash);
  expect(result.healthStatus).toBe(200);
});
