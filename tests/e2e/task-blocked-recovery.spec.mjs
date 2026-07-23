import { expect, test } from "@playwright/test";

async function createRecord(request, path, data, label) {
  const response = await request.post(path, { data });
  expect(response.status(), `${label} should be created`).toBe(201);
  return response.json();
}

async function readTask(request, taskId) {
  const response = await request.get(`/api/tasks/${encodeURIComponent(taskId)}`);
  expect(response.status()).toBe(200);
  return (await response.json()).task;
}

async function readTaskTimer(request, taskId) {
  const response = await request.get("/api/tasks/timers");
  expect(response.status()).toBe(200);
  return (await response.json()).timers.find((timer) => timer.task_id === taskId);
}

async function openTaskEditor(page, taskId) {
  await page.goto(`/tasks.html?task=${encodeURIComponent(taskId)}`);
  const dialog = page.locator("dialog[data-task-dialog][open]");
  await expect(dialog).toBeVisible();
  return dialog;
}

test("Blocked tasks recover through Play, checklist progress, and paused-timer resume", async ({ page, request }, testInfo) => {
  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const client = (await createRecord(request, "/api/clients", {
    name: `Blocked Recovery Client ${suffix}`,
  }, "the timer Client")).client;
  const project = (await createRecord(
    request,
    `/api/clients/${encodeURIComponent(client.id)}/projects`,
    { name: `Blocked Recovery Project ${suffix}` },
    "the timer Project",
  )).project;

  const manualTask = (await createRecord(request, "/api/tasks", {
    blocked_reason: "Waiting for a manual decision.",
    status: "blocked",
    title: `Manual blocked recovery ${suffix}`,
  }, "the manual blocked Task")).task;
  const workbenchTask = (await createRecord(request, "/api/tasks", {
    blocked_reason: "Waiting before focused work resumes.",
    status: "blocked",
    title: `Workbench blocked recovery ${suffix}`,
  }, "the Workbench blocked Task")).task;
  const checklistTask = (await createRecord(request, "/api/tasks", {
    blocked_reason: "Waiting before checklist work starts.",
    status: "blocked",
    title: `Checklist blocked recovery ${suffix}`,
  }, "the checklist blocked Task")).task;
  const checklist = await createRecord(
    request,
    `/api/tasks/${encodeURIComponent(checklistTask.task_id)}/checklist`,
    { label: "Begin the available work" },
    "the checklist item",
  );
  const timerTask = (await createRecord(request, "/api/tasks", {
    client_id: client.id,
    project_id: project.id,
    status: "open",
    title: `Timer blocked recovery ${suffix}`,
  }, "the timer Task")).task;
  const runningTimerTask = (await createRecord(request, "/api/tasks", {
    client_id: client.id,
    project_id: project.id,
    status: "open",
    title: `Block running timer ${suffix}`,
  }, "the running-timer Task")).task;

  let response = await request.put(`/api/tasks/${encodeURIComponent(timerTask.task_id)}/timer`, {
    data: {
      accumulated_elapsed_seconds: 0,
      last_active_start_time: new Date().toISOString(),
      timer_status: "running",
    },
  });
  expect(response.status()).toBe(200);
  response = await request.put(`/api/tasks/${encodeURIComponent(timerTask.task_id)}/timer`, {
    data: {
      accumulated_elapsed_seconds: 5,
      timer_status: "paused",
    },
  });
  expect(response.status()).toBe(200);
  response = await request.put(`/api/tasks/${encodeURIComponent(timerTask.task_id)}`, {
    data: {
      blocked_reason: "Blocked after the timer was paused.",
      status: "blocked",
    },
  });
  expect(response.status()).toBe(200);

  response = await request.put(`/api/tasks/${encodeURIComponent(runningTimerTask.task_id)}/timer`, {
    data: {
      accumulated_elapsed_seconds: 7,
      last_active_start_time: new Date().toISOString(),
      timer_status: "running",
    },
  });
  expect(response.status()).toBe(200);

  await page.goto(`/workbench.html?taskId=${encodeURIComponent(workbenchTask.task_id)}`);
  const workbenchResumeButton = page.getByRole("button", { name: "Resume task" });
  await expect(workbenchResumeButton).toBeVisible();
  await expect(workbenchResumeButton.locator("svg polygon")).toHaveCount(1);
  await workbenchResumeButton.click();
  await expect(page.getByRole("button", { name: "Block task" })).toBeVisible();
  let savedTask = await readTask(request, workbenchTask.task_id);
  expect(savedTask.status).toBe("in_progress");
  expect(savedTask.blocked_reason).toBe("");

  let dialog = await openTaskEditor(page, runningTimerTask.task_id);
  await expect(dialog.locator("[data-task-timer-status]")).toHaveText("Running.");
  await dialog.getByRole("button", { name: "Block task" }).click();
  const blockedReasonPrompt = page.locator("dialog[data-capture-prompt][open]");
  await blockedReasonPrompt.getByRole("textbox", { name: "Blocked reason" }).fill("Waiting after the running timer was paused.");
  await blockedReasonPrompt.getByRole("button", { name: "Continue" }).click();
  await expect(dialog.locator("select[data-task-form-status]")).toHaveValue("blocked");
  await expect(dialog.locator("[data-task-timer-status]")).toHaveText("Paused.");
  savedTask = await readTask(request, runningTimerTask.task_id);
  expect(savedTask.status).toBe("blocked");
  expect(savedTask.blocked_reason).toBe("Waiting after the running timer was paused.");
  const pausedTimer = await readTaskTimer(request, runningTimerTask.task_id);
  expect(pausedTimer.timer_status).toBe("paused");
  expect(pausedTimer.last_active_start_time).toBeNull();

  dialog = await openTaskEditor(page, manualTask.task_id);
  const resumeButton = dialog.getByRole("button", { name: "Resume task" });
  await expect(resumeButton).toBeVisible();
  await expect(resumeButton.locator("svg polygon")).toHaveCount(1);
  await resumeButton.click();
  await expect(dialog.locator("select[data-task-form-status]")).toHaveValue("in_progress");
  await expect(dialog.locator("[data-task-blocked-reason-field]")).toBeHidden();
  savedTask = await readTask(request, manualTask.task_id);
  expect(savedTask.status).toBe("in_progress");
  expect(savedTask.blocked_reason).toBe("");

  dialog = await openTaskEditor(page, checklistTask.task_id);
  await dialog.getByRole("checkbox", { name: `Mark ${checklist.item.label} complete` }).check();
  await expect(dialog.locator("select[data-task-form-status]")).toHaveValue("in_progress");
  await expect(dialog.locator("[data-task-blocked-reason-field]")).toBeHidden();
  savedTask = await readTask(request, checklistTask.task_id);
  expect(savedTask.status).toBe("in_progress");
  expect(savedTask.blocked_reason).toBe("");

  dialog = await openTaskEditor(page, timerTask.task_id);
  await dialog.locator("button[data-task-timer-start]").click();
  await expect(dialog.locator("select[data-task-form-status]")).toHaveValue("in_progress");
  await expect(dialog.locator("[data-task-blocked-reason-field]")).toBeHidden();
  savedTask = await readTask(request, timerTask.task_id);
  expect(savedTask.status).toBe("in_progress");
  expect(savedTask.blocked_reason).toBe("");
});
