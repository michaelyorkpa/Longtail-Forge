import { expect, test } from "@playwright/test";

const TASK_ID = "task-focus-exit-capture";

test("timed Task Focus captures context before Change Focus and app-shell navigation", async ({ page, isMobile }, testInfo) => {
  expect(["desktop", "mobile"]).toContain(testInfo.project.name);
  let resumeNote = "";
  const writes = [];

  await page.route(`**/api/tasks/${TASK_ID}`, async (route) => {
    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON();
      writes.push(payload);
      resumeNote = payload.resume_note || "";
    }
    await route.fulfill({
      contentType: "application/json",
      json: { task: taskFixture(resumeNote) },
    });
  });
  await page.route("**/api/active-timers/all", (route) => route.fulfill({
    contentType: "application/json",
    json: { timers: [taskTimerFixture()] },
  }));
  await page.route(`**/api/workbench/task-focus/${TASK_ID}/related-context`, (route) => route.fulfill({
    contentType: "application/json",
    json: { taskId: TASK_ID, groups: [], items: [] },
  }));

  await page.goto(`/workbench.html?taskId=${TASK_ID}`);
  await expect(page.getByRole("heading", { name: "Capture Task Focus exit context" })).toBeVisible();
  await page.getByRole("button", { name: "Change Focus" }).click();
  const changeFocusPrompt = page.getByRole("dialog", { name: "Add resume note?" });
  await expect(changeFocusPrompt).toBeVisible();
  await changeFocusPrompt.getByRole("textbox", { name: "Resume note" }).fill("Continue with the captured context.");
  await changeFocusPrompt.getByRole("button", { name: "Yes" }).click();
  await expect(page.locator("[data-workbench-host]")).toHaveAttribute("data-workbench-view-state", "focus-selection");
  expect(writes).toEqual([{ resume_note: "Continue with the captured context." }]);

  resumeNote = "";
  await page.goto(`/workbench.html?taskId=${TASK_ID}`);
  await expect(page.getByRole("heading", { name: "Capture Task Focus exit context" })).toBeVisible();
  if (isMobile) {
    await page.locator(".nav-toggle").click();
  }
  await page.locator('#primary-menu a[href="dashboard.html"]').click();
  const appShellPrompt = page.getByRole("dialog", { name: "Add resume note?" });
  await expect(appShellPrompt).toBeVisible();
  await appShellPrompt.getByRole("button", { name: "No" }).click();
  await expect(page).toHaveURL(/\/dashboard\.html$/);
  expect(writes).toHaveLength(1);
});

function taskFixture(resumeNote) {
  return {
    assignees: [],
    checklistItems: [],
    priority: "normal",
    project_id: "exit-capture-project",
    project_name: "Exit Capture Project",
    resume_note: resumeNote,
    status: "in_progress",
    task_id: TASK_ID,
    title: "Capture Task Focus exit context",
  };
}

function taskTimerFixture() {
  return {
    accumulated_elapsed_seconds: 900,
    active_task_timer_id: "exit-capture-timer",
    active_timer_id: "exit-capture-timer",
    source_enabled: true,
    source_id: TASK_ID,
    source_module_id: "tasks",
    source_type: "task",
    task_id: TASK_ID,
    timer_slot: `source:tasks:task:${TASK_ID}`,
    timer_status: "running",
  };
}
