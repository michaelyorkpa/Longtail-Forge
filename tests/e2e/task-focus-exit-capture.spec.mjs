import { expect, test } from "@playwright/test";

const TASK_ID = "task-focus-exit-capture";

test("basic Task Focus consumes and recaptures context across Change Focus and app-shell navigation", async ({ page, isMobile }, testInfo) => {
  expect(["desktop", "mobile"]).toContain(testInfo.project.name);
  let resumeNote = "Review the saved pricing context.";
  let taskStatus = "open";
  /** @type {{ resume_note?: string, resume_note_action?: string }[]} */
  const writes = [];

  await page.route(`**/api/tasks/${TASK_ID}`, async (route) => {
    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON();
      writes.push(payload);
      if (payload.resume_note_action === "consume") {
        resumeNote = "";
      } else if (payload.resume_note_action === "capture") {
        resumeNote = payload.resume_note || "";
        taskStatus = "in_progress";
      }
    }
    await route.fulfill({
      contentType: "application/json",
      json: { task: taskFixture(resumeNote, taskStatus) },
    });
  });
  await page.route("**/api/workbench/focus-candidates?**", (route) => route.fulfill({
    contentType: "application/json",
    json: {
      focusContext: null,
      items: [taskCandidate(resumeNote, taskStatus)],
    },
  }));
  await page.route("**/api/active-timers/all", (route) => route.fulfill({
    contentType: "application/json",
    json: { timers: [] },
  }));
  await page.route(`**/api/workbench/task-focus/${TASK_ID}/related-context`, (route) => route.fulfill({
    contentType: "application/json",
    json: { taskId: TASK_ID, groups: [], items: [] },
  }));

  await page.goto(`/workbench.html?taskId=${TASK_ID}`);
  await expect(page.getByRole("heading", { name: "Capture Task Focus exit context" })).toBeVisible();
  await expect.poll(() => writes).toEqual([{ resume_note_action: "consume" }]);
  expect(taskStatus).toBe("open");

  await page.getByRole("button", { name: "Change Focus" }).click();
  const firstChangeFocusPrompt = page.getByRole("dialog", { name: "Add resume note?" });
  await expect(firstChangeFocusPrompt).toBeVisible();
  await firstChangeFocusPrompt.getByRole("button", { name: "No" }).click();
  await expect(page.locator("[data-workbench-host]")).toHaveAttribute("data-workbench-view-state", "focus-selection");
  expect(writes).toEqual([{ resume_note_action: "consume" }]);
  expect(taskStatus).toBe("open");

  await page.getByRole("button", { name: "Focus task" }).first().click();
  await expect(page.getByRole("heading", { name: "Capture Task Focus exit context" })).toBeVisible();
  await page.getByRole("button", { name: "Change Focus" }).click();
  const secondChangeFocusPrompt = page.getByRole("dialog", { name: "Add resume note?" });
  await expect(secondChangeFocusPrompt).toBeVisible();
  await secondChangeFocusPrompt.getByRole("textbox", { name: "Resume note" }).fill("Continue with the captured context.");
  await secondChangeFocusPrompt.getByRole("button", { name: "Yes" }).click();
  await expect(page.locator("[data-workbench-host]")).toHaveAttribute("data-workbench-view-state", "focus-selection");
  await expect(page.getByText("Resume note: Continue with the captured context.")).toBeVisible();
  expect(writes).toEqual([
    { resume_note_action: "consume" },
    {
      resume_note: "Continue with the captured context.",
      resume_note_action: "capture",
    },
  ]);
  expect(taskStatus).toBe("in_progress");

  await page.getByRole("button", { name: "Focus task" }).first().click();
  // The focus surface renders the candidate's title before the task is read back and its note
  // consumed, so the heading is not a barrier for the consume PUT. Wait for the write itself, and
  // for the exact sequence, so a substituted or extra write cannot satisfy the check.
  await expect.poll(() => writes).toEqual([
    { resume_note_action: "consume" },
    {
      resume_note: "Continue with the captured context.",
      resume_note_action: "capture",
    },
    { resume_note_action: "consume" },
  ]);
  await expect(page.getByRole("heading", { name: "Capture Task Focus exit context" })).toBeVisible();
  expect(taskStatus).toBe("in_progress");

  if (isMobile) {
    await page.locator(".nav-toggle").click();
  }
  await page.locator('#primary-menu a[href="dashboard.html"]').click();
  const appShellPrompt = page.getByRole("dialog", { name: "Add resume note?" });
  await expect(appShellPrompt).toBeVisible();
  await appShellPrompt.getByRole("button", { name: "No" }).click();
  await expect(page).toHaveURL(/\/dashboard\.html$/);
  expect(writes).toHaveLength(3);
  expect(taskStatus).toBe("in_progress");
});

test("a task that became Blocked changes focus without a resume-note prompt", async ({ page }) => {
  let taskStatus = "open";
  let blockedReason = "";
  /** @type {{ resume_note?: string, resume_note_action?: string }[]} */
  const writes = [];

  await page.route(`**/api/tasks/${TASK_ID}`, async (route) => {
    if (route.request().method() === "PUT") {
      writes.push(route.request().postDataJSON());
    }
    await route.fulfill({
      contentType: "application/json",
      json: { task: taskFixture("", taskStatus, blockedReason) },
    });
  });
  await page.route("**/api/workbench/focus-candidates?**", (route) => route.fulfill({
    contentType: "application/json",
    json: {
      focusContext: null,
      items: [taskCandidate("", taskStatus)],
    },
  }));
  await page.route("**/api/active-timers/all", (route) => route.fulfill({
    contentType: "application/json",
    json: { timers: [] },
  }));
  await page.route(`**/api/workbench/task-focus/${TASK_ID}/related-context`, (route) => route.fulfill({
    contentType: "application/json",
    json: { taskId: TASK_ID, groups: [], items: [] },
  }));

  await page.goto(`/workbench.html?taskId=${TASK_ID}`);
  await expect(page.getByRole("heading", { name: "Capture Task Focus exit context" })).toBeVisible();

  taskStatus = "blocked";
  blockedReason = "The task became Blocked while focus was active.";
  await page.getByRole("button", { name: "Change Focus" }).click();

  await expect(page.getByRole("dialog", { name: "Add resume note?" })).not.toBeVisible();
  await expect(page.locator("[data-workbench-host]")).toHaveAttribute("data-workbench-view-state", "focus-selection");
  expect(writes).toEqual([]);
});

/**
 * @param {string} resumeNote
 * @param {string} status
 * @param {string} [blockedReason]
 */
function taskFixture(resumeNote, status, blockedReason = "") {
  return {
    assignees: [],
    blocked_reason: blockedReason,
    checklistItems: [],
    priority: "normal",
    project_id: "exit-capture-project",
    project_name: "Exit Capture Project",
    resume_note: resumeNote,
    status,
    task_id: TASK_ID,
    title: "Capture Task Focus exit context",
  };
}

/**
 * @param {string} resumeNote
 * @param {string} status
 */
function taskCandidate(resumeNote, status) {
  return {
    candidateId: `task-work-item:tasks:task:${TASK_ID}`,
    contextLabel: "Exit Capture Project",
    handoffNote: resumeNote,
    moduleId: "tasks",
    recordId: TASK_ID,
    recordType: "task",
    status,
    title: "Capture Task Focus exit context",
  };
}
