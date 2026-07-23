import { expect, test } from "@playwright/test";

test("mobile Dashboard and Actions Calendar default to Day with active-status reminders", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "responsive Day fallback is a mobile-viewport contract");

  const requests = [];
  await stubCalendarPreference(page, null);
  await stubCalendarReads(page, requests);

  for (const surface of [
    {
      path: "/dashboard.html",
      activeView: '[data-dashboard-calendar-view="day"]',
    },
    {
      path: "/calendar.html",
      activeView: '[data-calendar-view-option="day"]',
    },
  ]) {
    await page.goto(surface.path);
    await expect(page.locator(surface.activeView)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".calendar-day-view")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open task: Mobile reminder proof" })).toBeVisible();
  }

  expect(requests).toHaveLength(2);
  for (const requestUrl of requests) {
    expect(requestUrl.searchParams.get("start")).toBe(requestUrl.searchParams.get("end"));
    expect(requestUrl.searchParams.get("statuses")).toBe("open,in_progress,blocked");
  }
});

test("saved calendar preference wins on Dashboard and Actions Calendar", async ({ page }, testInfo) => {
  const preferredView = testInfo.project.name === "mobile" ? "week" : "day";
  await stubCalendarPreference(page, preferredView);
  await stubCalendarReads(page);

  for (const surface of [
    {
      path: "/dashboard.html",
      activeView: `[data-dashboard-calendar-view="${preferredView}"]`,
    },
    {
      path: "/calendar.html",
      activeView: `[data-calendar-view-option="${preferredView}"]`,
    },
  ]) {
    await page.goto(surface.path);
    await expect(page.locator(surface.activeView)).toHaveAttribute("aria-pressed", "true");
  }
});

test("Actions Calendar query view takes precedence over the saved preference", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "one viewport is sufficient for explicit query precedence");

  await stubCalendarPreference(page, "week");
  await stubCalendarReads(page);
  await page.goto("/calendar.html?view=month");
  await expect(page.locator('[data-calendar-view-option="month"]')).toHaveAttribute("aria-pressed", "true");
});

async function stubCalendarPreference(page, preferredCalendarView) {
  await page.route("**/api/app-shell/bootstrap", async (route) => {
    const response = await route.fetch();
    const shell = await response.json();
    await route.fulfill({
      response,
      json: {
        ...shell,
        user: {
          ...(shell.user || {}),
          preferredCalendarView,
        },
      },
    });
  });
}

async function stubCalendarReads(page, requests = []) {
  await page.route("**/api/tasks/calendar?*", async (route) => {
    const requestUrl = new URL(route.request().url());
    const date = requestUrl.searchParams.get("start");
    requests.push(requestUrl);
    await route.fulfill({
      contentType: "application/json",
      json: {
        range: { startDate: date, endDate: requestUrl.searchParams.get("end") },
        source_enabled: true,
        tasks: [{
          task_id: "mobile-calendar-task",
          title: "Mobile calendar proof",
          due_date: date,
          due_time: "09:00",
          status: "open",
          priority: "normal",
        }],
        reminders: [{
          task_id: "mobile-calendar-reminder",
          title: "Mobile reminder proof",
          date,
          reminder_at_utc: `${date}T08:00:00.000Z`,
        }],
      },
    });
  });
}
