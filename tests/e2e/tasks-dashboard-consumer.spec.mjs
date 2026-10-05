import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

test("Tasks Dashboard renders real summary handoffs and switches the embedded calendar", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const title = `Dashboard ${randomUUID()}`;
  const today = new Date().toISOString().slice(0, 10);
  const response = await api.post("/api/tasks", { data: { title, due_date: today } });
  expect(response.status(), await response.text()).toBe(201);
  const task = (await response.json()).task;
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/dashboard.html");
  const pressure = page.locator('[data-dashboard-renderer="tasks.pressure"]');
  const attention = page.locator('[data-dashboard-renderer="tasks.needs-attention"]');
  const upcoming = page.locator('[data-dashboard-renderer="tasks.today-upcoming"]');
  await expect(pressure).toBeVisible(); await expect(attention).toBeVisible(); await expect(upcoming).toBeVisible();
  await expect(pressure.locator(".dashboard-task-metrics span")).toHaveText(["Overdue", "Due soon", "Blocked", "Assigned to me"]);
  await expect(upcoming.locator(".dashboard-task-row-title")).toContainText([title]);
  await expect(upcoming.locator(".dashboard-task-row-action").filter({ hasText: "Open Workbench" }).first()).toHaveAttribute("href", `workbench.html?taskId=${encodeURIComponent(task.task_id)}`);
  expect(await pressure.locator(".dashboard-task-row").count()).toBeLessThanOrEqual(1);
  const calendar = page.locator('[data-dashboard-renderer="tasks.calendar"]');
  for (const view of ["day", "week", "month"]) {
    await calendar.locator(`[data-dashboard-calendar-view="${view}"]`).click();
    await expect(calendar.locator(`[data-dashboard-calendar-view="${view}"]`)).toHaveAttribute("aria-pressed", "true");
    await expect(calendar.getByRole("button", { name: `Open task: ${title}` }).first()).toBeVisible();
  }
  await calendar.getByRole("button", { name: `Open task: ${title}` }).first().click();
  await expect(page.locator("dialog[data-task-dialog][open]")).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("dashboard-consumer.png"), fullPage: true });
  // The shared fixture removes this UUID account and its owned workspace, including the task.
});

test("Tasks Dashboard preserves neighboring rows and recovers from failed summary reads", async ({ isolatedWorkspace }, testInfo) => {
  const { page } = isolatedWorkspace;
  let fail = false;
  await page.route("**/api/tasks/dashboard-summary", async (route) => {
    if (fail) { await route.fulfill({ status: 503, json: { code: "service_unavailable" } }); return; }
    const response = await route.fetch(); expect(response.ok()).toBeTruthy();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body,
      attentionRows: [{ title: "Readable before" }, null, { title: "Readable after", reasons: ["One", 2] }],
      upcomingRows: [], pressureRows: [],
    } });
  });
  await page.goto("/dashboard.html");
  const attention = page.locator('[data-dashboard-renderer="tasks.needs-attention"]');
  await expect(attention.locator(".dashboard-task-row-title")).toHaveText(["Readable before", "Untitled task", "Readable after"]);
  await expect(attention.locator(".dashboard-task-row-reasons span")).toHaveText(["One", "2"]);
  await expect(page.locator('[data-dashboard-renderer="tasks.today-upcoming"]')).toContainText("No due-today or due-this-week task work.");
  fail = true; await page.reload();
  await expect(attention).toContainText("Needs Attention unavailable");
  await expect(attention.locator(".dashboard-task-row-title")).toHaveCount(0);
  fail = false; await page.reload();
  await expect(attention.locator(".dashboard-task-row-title")).toHaveText(["Readable before", "Untitled task", "Readable after"]);
  await page.screenshot({ path: testInfo.outputPath("dashboard-recovered.png"), fullPage: true });
});
