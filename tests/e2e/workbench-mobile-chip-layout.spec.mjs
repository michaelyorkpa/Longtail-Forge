/* global document */
// The page.evaluate callback below runs in the browser, not Node.

import { expect, test } from "@playwright/test";

const TASK_ID = "mobile-layout-task";

test("mobile Task Focus and Other Active Timers keep chips with their records", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "chip stacking is a mobile-viewport contract");

  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  await stubWorkbenchLayoutData(page);
  await page.goto(`/workbench.html?taskId=${TASK_ID}`);

  const taskSummary = page.locator("[data-workbench-task-focus-summary]");
  const taskCopy = taskSummary.locator(".workbench-task-focus-heading-copy");
  const taskBadges = taskSummary.locator(".workbench-task-focus-badges");
  await expect(taskSummary.getByRole("heading", { name: "Prepare an exceptionally detailed mobile release review" })).toBeVisible();
  await expect(taskSummary.getByText("Northwind Mobile Operations / Responsive Foundation Rollout", { exact: true })).toBeVisible();
  await expect(taskBadges.locator(".workbench-badge")).toHaveCount(6);

  const taskCopyBox = await taskCopy.boundingBox();
  const taskBadgeBox = await taskBadges.boundingBox();
  expect(taskBadgeBox.y).toBeGreaterThanOrEqual(taskCopyBox.y + taskCopyBox.height - 1);
  expect(Math.abs(taskBadgeBox.x - taskCopyBox.x)).toBeLessThanOrEqual(2);

  const timerSection = page.locator('[data-workbench-card="active-work-timers"]');
  await expect(timerSection.locator(".workbench-section-title")).toHaveText("Other Active Timers");
  const timerCards = timerSection.locator(".workbench-timer-card");
  await expect(timerCards).toHaveCount(2);

  for (let index = 0; index < 2; index += 1) {
    const card = timerCards.nth(index);
    const title = card.locator(".workbench-timer-title");
    const badges = card.locator("summary .workbench-card-meta");
    const cardBox = await card.boundingBox();
    const titleBox = await title.boundingBox();
    const badgeBox = await badges.boundingBox();
    await expect(badges.locator(".workbench-badge")).toHaveCount(2);
    expect(badgeBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 1);
    expect(badgeBox.x).toBeGreaterThanOrEqual(cardBox.x);
    expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
  }

  const overflow = await page.evaluate(() => ({
    clientWidth: document.scrollingElement.clientWidth,
    scrollWidth: document.scrollingElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  expect(consoleErrors).toEqual([]);
});

test("desktop keeps Task Focus and timer badges in their compact side positions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop layout is covered once at the named desktop viewport");

  await stubWorkbenchLayoutData(page);
  await page.goto(`/workbench.html?taskId=${TASK_ID}`);

  const taskSummary = page.locator("[data-workbench-task-focus-summary]");
  await expect(taskSummary.getByRole("heading", { name: "Prepare an exceptionally detailed mobile release review" })).toBeVisible();
  await expect(taskSummary.locator(".workbench-task-focus-badges")).toBeVisible();
  const taskCopyBox = await taskSummary.locator(".workbench-task-focus-heading-copy").boundingBox();
  const taskBadgeBox = await taskSummary.locator(".workbench-task-focus-badges").boundingBox();
  expect(taskBadgeBox.x).toBeGreaterThan(taskCopyBox.x);

  const firstTimer = page.locator('[data-workbench-card="active-work-timers"] .workbench-timer-card').first();
  await expect(firstTimer).toBeVisible();
  const titleBox = await firstTimer.locator(".workbench-timer-title").boundingBox();
  const badgeBox = await firstTimer.locator("summary .workbench-card-meta").boundingBox();
  expect(Math.abs(badgeBox.y - titleBox.y)).toBeLessThan(titleBox.height + 2);
  expect(badgeBox.x).toBeGreaterThan(titleBox.x);
});

async function stubWorkbenchLayoutData(page) {
  await page.route("**/api/active-timers/all", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        timers: [
          timerFixture({
            active_timer_id: "mobile-manual-timer-one",
            description: "Review mobile release evidence and capture follow-up notes",
            project_name: "Responsive Foundation Rollout",
            source_label: "Mobile release evidence review",
            timer_slot: "1",
            timer_status: "running",
          }),
          timerFixture({
            active_timer_id: "mobile-manual-timer-two",
            description: "Prepare customer handoff notes for the corrected layout",
            project_name: "Customer Experience Improvements",
            source_label: "Customer handoff preparation",
            timer_slot: "2",
            timer_status: "paused",
          }),
        ],
      },
    });
  });

  await page.route(`**/api/tasks/${TASK_ID}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        task: {
          task_id: TASK_ID,
          title: "Prepare an exceptionally detailed mobile release review",
          client_name: "Northwind Mobile Operations",
          project_id: "mobile-layout-project",
          project_name: "Responsive Foundation Rollout",
          status: "in_progress",
          priority: "high",
          due_date: "2026-07-23",
          due_time: "15:30",
          next_action: "Confirm every mobile chip remains attached to its own work record.",
          directTags: [
            { name: "Mobile layout verification" },
            { name: "Release readiness follow-up" },
            { name: "Customer experience" },
          ],
          assignees: [],
          checklistItems: [],
        },
      },
    });
  });

  await page.route(`**/api/workbench/task-focus/${TASK_ID}/related-context`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { taskId: TASK_ID, groups: [], items: [] },
    });
  });
}

function timerFixture(overrides) {
  return {
    accumulated_elapsed_seconds: 845,
    billable: "yes",
    client_name: "Northwind Mobile Operations",
    source_enabled: true,
    source_id: "",
    source_module_id: "time-tracking",
    source_type: "manual",
    ...overrides,
  };
}
