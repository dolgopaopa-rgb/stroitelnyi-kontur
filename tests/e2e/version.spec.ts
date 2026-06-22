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
