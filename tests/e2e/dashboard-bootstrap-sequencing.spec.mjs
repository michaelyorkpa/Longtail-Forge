/* global performance, window */

import { expect, test } from "@playwright/test";

/** @typedef {typeof window & { __dashboardPanelFetchStarts: number[] }} DashboardMeasuredWindow */

test("Dashboard starts panel reads before contributed assets finish and lazy-loads the Task editor", { tag: "@desktop" }, async ({ page }) => {
  /** @type {string[]} */
  const requestedPaths = [];
  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    /** @type {DashboardMeasuredWindow} */ (window).__dashboardPanelFetchStarts = [];
    window.fetch = function measuredDashboardFetch(input, init) {
      const url = new URL(typeof input === "string" ? input : /** @type {Request} */ (input).url, window.location.href);
      if (
        url.pathname === "/api/tasks/dashboard-summary" ||
        url.pathname === "/api/tasks/calendar" ||
        url.pathname === "/api/time-tracking/dashboard/effort-summary"
      ) {
        /** @type {DashboardMeasuredWindow} */ (window).__dashboardPanelFetchStarts.push(performance.now());
      }
      return originalFetch.call(this, input, init);
    };
  });
  /** @type {((value?: unknown) => void) | undefined} */
  let releaseTasksAsset;
  const tasksAssetReleased = new Promise((resolve) => {
    releaseTasksAsset = resolve;
  });
  /** @type {((value?: unknown) => void) | undefined} */
  let markTasksAssetRequested;
  const tasksAssetRequested = new Promise((resolve) => {
    markTasksAssetRequested = resolve;
  });

  page.on("request", (request) => {
    requestedPaths.push(new URL(request.url()).pathname);
  });
  await page.route("**/js/tasks-dashboard.js?*", async (route) => {
    if (!markTasksAssetRequested) {
      throw new Error("the tasks-asset request marker was not initialized");
    }
    markTasksAssetRequested();
    await tasksAssetReleased;
    await route.continue();
  });
  await page.route("**/api/tasks/calendar?*", async (route) => {
    const requestUrl = new URL(route.request().url());
    const date = requestUrl.searchParams.get("start");
    await route.fulfill({
      contentType: "application/json",
      json: {
        range: {
          startDate: date,
          endDate: requestUrl.searchParams.get("end"),
        },
        reminders: [],
        source_enabled: true,
        tasks: [{
          due_date: date,
          priority: "normal",
          status: "open",
          task_id: "dashboard-lazy-dialog-proof",
          title: "Lazy editor proof",
        }],
      },
    });
  });

  await page.goto("/dashboard.html", { waitUntil: "domcontentloaded" });
  await tasksAssetRequested;

  await expect.poll(() => new Set(requestedPaths.filter((path) => (
    path === "/api/tasks/dashboard-summary" ||
    path === "/api/tasks/calendar" ||
    path === "/api/time-tracking/dashboard/effort-summary"
  ))).size).toBe(3);
  await page.waitForLoadState("load");
  const firstFetchGap = await page.evaluate(() => (
    Math.min(...(/** @type {DashboardMeasuredWindow} */ (window).__dashboardPanelFetchStarts)) -
    /** @type {PerformanceNavigationTiming} */ (performance.getEntriesByType("navigation")[0]).loadEventEnd
  ));
  expect(firstFetchGap).toBeLessThanOrEqual(1000);
  expect(requestedPaths).not.toContain("/js/task-dialog.js");

  if (!releaseTasksAsset) {
    throw new Error("the tasks-asset release resolver was not initialized");
  }
  releaseTasksAsset();
  const taskButton = page.getByRole("button", { name: "Open task: Lazy editor proof" });
  await expect(taskButton).toBeVisible();
  await taskButton.click();
  await expect.poll(() => requestedPaths.filter((path) => path === "/js/task-dialog.js").length).toBe(1);
});
