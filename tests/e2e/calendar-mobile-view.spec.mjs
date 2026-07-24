import { expect, test } from "@playwright/test";

test("mobile Dashboard and Actions Calendar default to Day with their deliberate status split", async ({ page }, testInfo) => {
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
    const plannedOccurrence = page.getByRole("button", {
      name: "Open planned occurrence: Mobile planned recurrence proof",
    });
    await expect(plannedOccurrence).toBeVisible();
    await expect(plannedOccurrence).toBeEnabled();
    await expect(plannedOccurrence.locator(".calendar-entry-virtual")).toHaveText("Planned occurrence");
    if (surface.path === "/calendar.html") {
      await expect(page.getByRole("button", { name: "Open task: Mobile completed proof" })).toBeVisible();
    } else {
      await expect(page.getByRole("button", { name: "Open task: Mobile completed proof" })).toHaveCount(0);
    }
  }

  expect(requests).toHaveLength(2);
  expect(requests[0].searchParams.get("start")).toBe(requests[0].searchParams.get("end"));
  expect(requests[0].searchParams.get("statuses")).toBe("open,in_progress,blocked");
  expect(requests[1].searchParams.get("start")).toBe(requests[1].searchParams.get("end"));
  expect(requests[1].searchParams.get("statuses")).toBe("open,in_progress,blocked,complete");
});

test("opening a planned occurrence materializes it once and replaces the ghost", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one viewport is sufficient for materialize-on-touch behavior");

  const state = { materialized: false, materializationRequests: [] };
  await stubCalendarPreference(page, "day");
  await stubCalendarReads(page, [], state);
  await stubOccurrenceMaterialization(page, state);
  await page.goto("/calendar.html?view=day&date=2026-07-23");

  const plannedOccurrence = page.getByRole("button", {
    name: "Open planned occurrence: Mobile planned recurrence proof",
  });
  await expect(plannedOccurrence).toBeVisible();
  await plannedOccurrence.click();

  await expect.poll(() => state.materializationRequests).toEqual([{
    instanceDate: "2026-07-23",
    templateId: "mobile-calendar-template",
  }]);
  const dialog = page.locator("[data-task-dialog]");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-task-dialog-title]")).toHaveText("Edit Task");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByRole("button", { name: "Open task: Mobile planned recurrence proof" })).toBeVisible();
  await expect(page.getByRole("button", {
    name: "Open planned occurrence: Mobile planned recurrence proof",
  })).toHaveCount(0);
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

test("Actions Calendar keeps completed history bounded in Day, Week, and Month while Archived is opt-in", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one viewport is sufficient for the full Calendar status and range contract");

  const requests = [];
  await stubCalendarPreference(page, null);
  await stubCalendarReads(page, requests);
  await page.goto("/calendar.html?view=day&date=2026-07-23");

  const statusFilter = page.locator("[data-calendar-status-filter]");
  await page.getByRole("group", { name: "Calendar filters" }).locator("summary").click();
  await expect(statusFilter).toBeVisible();
  await expect.poll(() => selectedValues(statusFilter)).toEqual(["open", "in_progress", "blocked", "complete"]);
  await expect(page.getByRole("button", { name: "Open task: Mobile completed proof" })).toBeVisible();

  await page.locator('[data-calendar-view-option="week"]').click();
  await expect.poll(() => requests.length).toBe(2);
  await expect(page.getByRole("button", { name: "Open task: Mobile completed proof" })).toBeVisible();

  await page.locator('[data-calendar-view-option="month"]').click();
  await expect.poll(() => requests.length).toBe(3);
  await expect(page.getByRole("button", { name: "Open task: Mobile completed proof" })).toBeVisible();

  expect(requests.map((requestUrl) => requestUrl.searchParams.get("statuses"))).toEqual([
    "open,in_progress,blocked,complete",
    "open,in_progress,blocked,complete",
    "open,in_progress,blocked,complete",
  ]);
  expect(calendarWindowDays(requests[0])).toBe(1);
  expect(calendarWindowDays(requests[1])).toBe(7);
  expect(calendarWindowDays(requests[2])).toBeLessThanOrEqual(42);

  await statusFilter.selectOption(["open", "in_progress", "blocked", "complete", "archived"]);
  await expect.poll(() => requests.length).toBe(4);
  expect(requests[3].searchParams.get("statuses")).toBe("open,in_progress,blocked,complete,archived");
  expect(calendarWindowDays(requests[3])).toBeLessThanOrEqual(42);
  await expect(page.getByRole("button", { name: "Open task: Mobile archived proof" })).toBeVisible();
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

async function stubCalendarReads(page, requests = [], state = {}) {
  await page.route("**/api/tasks/calendar?*", async (route) => {
    const requestUrl = new URL(route.request().url());
    const date = requestUrl.searchParams.get("start");
    const endDate = requestUrl.searchParams.get("end");
    const statuses = String(requestUrl.searchParams.get("statuses") || "").split(",");
    requests.push(requestUrl);
    await route.fulfill({
      contentType: "application/json",
      json: {
        range: { startDate: date, endDate: requestUrl.searchParams.get("end") },
        source_enabled: true,
        tasks: [
          {
            task_id: "mobile-calendar-task",
            title: "Mobile calendar proof",
            due_date: date,
            due_time: "09:00",
            status: "open",
            priority: "normal",
          },
          ...(date === endDate ? [state.materialized
            ? materializedCalendarTask(date)
            : {
                task_id: "",
                id: `recurrence:mobile-calendar-template:${date}`,
                templateId: "mobile-calendar-template",
                instanceDate: date,
                virtual: true,
                title: "Mobile planned recurrence proof",
                due_date: date,
                due_time: "",
                status: "open",
                priority: "normal",
              }] : []),
          ...(statuses.includes("complete") ? [{
            task_id: "mobile-calendar-completed-task",
            title: "Mobile completed proof",
            due_date: date,
            due_time: "10:00",
            status: "complete",
            priority: "normal",
          }] : []),
          ...(statuses.includes("archived") ? [{
            task_id: "mobile-calendar-archived-task",
            title: "Mobile archived proof",
            due_date: date,
            due_time: "11:00",
            status: "archived",
            priority: "normal",
          }] : []),
        ],
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

async function stubOccurrenceMaterialization(page, state) {
  await page.route("**/api/tasks/recurrence-instances/materialize", async (route) => {
    const payload = route.request().postDataJSON();
    state.materializationRequests.push(payload);
    state.materialized = true;
    await route.fulfill({
      contentType: "application/json",
      json: {
        task: materializedTaskDetail(payload.instanceDate),
        wasCreated: true,
      },
    });
  });
  await page.route(/\/api\/tasks\/mobile-calendar-materialized-task$/, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        currentUserId: "mobile-calendar-user",
        options: {
          clients: [],
          projects: [],
          taskTimersEnabled: true,
          timeTrackingEnabled: true,
          users: [],
          workspaceType: "business",
        },
        task: materializedTaskDetail(state.materializationRequests[0]?.instanceDate || "2026-07-23"),
      },
    });
  });
}

function materializedCalendarTask(date) {
  return {
    task_id: "mobile-calendar-materialized-task",
    title: "Mobile planned recurrence proof",
    due_date: date,
    due_time: "",
    status: "open",
    priority: "normal",
  };
}

function materializedTaskDetail(date) {
  return {
    ...materializedCalendarTask(date),
    workspace_id: "mobile-calendar-workspace",
    description: "",
    next_action: "",
    blocked_reason: "",
    resume_note: "",
    estimate_minutes: null,
    billable: "no",
    due_timezone: "America/New_York",
    due_at_utc: "",
    source_type: "recurrence",
    source_id: "mobile-calendar-template",
    recurrence_template_id: "mobile-calendar-template",
    recurrence_instance_date: date,
    created_by_user_id: "mobile-calendar-user",
    updated_by_user_id: "mobile-calendar-user",
    assignee_ids: [],
    assignees: [],
    checklistItems: [],
    tags: [],
    recurrenceDetails: {
      enabled: true,
      frequency: "WEEKLY",
      interval: 1,
      endDate: "",
    },
  };
}

async function selectedValues(locator) {
  return locator.evaluate((select) => [...select.selectedOptions].map((option) => option.value));
}

function calendarWindowDays(requestUrl) {
  const start = new Date(`${requestUrl.searchParams.get("start")}T00:00:00.000Z`);
  const end = new Date(`${requestUrl.searchParams.get("end")}T00:00:00.000Z`);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}
