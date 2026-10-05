import { expect, test } from "@playwright/test";

/**
 * @param {import("@playwright/test").APIRequestContext} request
 * @param {Record<string, unknown>} data
 * @param {string} label
 */
async function createTask(request, data, label) {
  const response = await request.post("/api/tasks", { data });
  expect(response.status(), `${label} should be created`).toBe(201);
  return (await response.json()).task;
}

/**
 * @param {import("@playwright/test").APIRequestContext} request
 * @param {string} taskId
 */
async function readTask(request, taskId) {
  const response = await request.get(`/api/tasks/${encodeURIComponent(taskId)}`);
  expect(response.status()).toBe(200);
  return (await response.json()).task;
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} taskId
 */
async function openTaskEditor(page, taskId) {
  await page.goto(`/tasks.html?task=${encodeURIComponent(taskId)}`);
  const dialog = page.locator("dialog[data-task-dialog][open]");
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} taskId
 */
function watchTaskWrites(page, taskId) {
  /** @type {{ method: string, path: string }[]} */
  const writes = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === `/api/tasks/${taskId}` && request.method() === "PUT") {
      writes.push({ method: "PUT", path: url.pathname });
    }
    if (url.pathname === `/api/tasks/${taskId}/complete` && request.method() === "POST") {
      writes.push({ method: "POST", path: url.pathname });
    }
  });
  return writes;
}

test("Task editor completion closes directly and asks recurrence scope only for template-backed edits", async ({ page, request }, testInfo) => {
  expect(["desktop", "mobile"]).toContain(testInfo.project.name);
  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const recurrence = {
    enabled: true,
    endDate: "2026-08-15",
    frequency: "DAILY",
    interval: 1,
  };

  const cleanTask = await createTask(request, {
    due_date: "2026-08-01",
    recurrence,
    title: `Clean recurring completion ${suffix}`,
  }, "the clean recurring Task");
  let writes = watchTaskWrites(page, cleanTask.task_id);
  let dialog = await openTaskEditor(page, cleanTask.task_id);
  await dialog.getByRole("button", { name: "Complete task" }).click();
  await expect(page.getByRole("dialog", { name: "Update recurring task" })).toHaveCount(0);
  await expect(dialog).toBeHidden();
  expect(writes).toEqual([
    { method: "POST", path: `/api/tasks/${cleanTask.task_id}/complete` },
  ]);
  expect((await readTask(request, cleanTask.task_id)).status).toBe("complete");

  const occurrenceTask = await createTask(request, {
    due_date: "2026-08-02",
    recurrence,
    title: `Occurrence-only recurring completion ${suffix}`,
  }, "the occurrence-only recurring Task");
  writes = watchTaskWrites(page, occurrenceTask.task_id);
  dialog = await openTaskEditor(page, occurrenceTask.task_id);
  await dialog.locator("[data-task-details-panel] > summary").click();
  const nextAction = `Retained occurrence context ${suffix}`;
  await dialog.locator("[data-task-next-action]").fill(nextAction);
  await dialog.getByRole("button", { name: "Complete task" }).click();
  await expect(page.getByRole("dialog", { name: "Update recurring task" })).toHaveCount(0);
  await expect(dialog).toBeHidden();
  expect(writes).toEqual([
    { method: "PUT", path: `/api/tasks/${occurrenceTask.task_id}` },
    { method: "POST", path: `/api/tasks/${occurrenceTask.task_id}/complete` },
  ]);
  const savedOccurrence = await readTask(request, occurrenceTask.task_id);
  expect(savedOccurrence.status).toBe("complete");
  expect(savedOccurrence.next_action).toBe(nextAction);

  const templateTask = await createTask(request, {
    due_date: "2026-08-03",
    recurrence,
    title: `Template-backed recurring completion ${suffix}`,
  }, "the template-backed recurring Task");
  writes = watchTaskWrites(page, templateTask.task_id);
  dialog = await openTaskEditor(page, templateTask.task_id);
  const updatedTitle = `Template-backed title updated ${suffix}`;
  await dialog.locator("[data-task-title]").fill(updatedTitle);
  await dialog.getByRole("button", { name: "Complete task" }).click();

  const recurrencePrompt = page.getByRole("dialog", { name: "Update recurring task" });
  await expect(recurrencePrompt).toBeVisible();
  await expect(recurrencePrompt).toHaveCount(1);
  await recurrencePrompt.getByRole("button", { name: "Only This Task" }).click();
  await expect(dialog).toBeHidden();
  expect(writes).toEqual([
    { method: "PUT", path: `/api/tasks/${templateTask.task_id}` },
    { method: "POST", path: `/api/tasks/${templateTask.task_id}/complete` },
  ]);
  const savedTemplateOccurrence = await readTask(request, templateTask.task_id);
  expect(savedTemplateOccurrence.status).toBe("complete");
  expect(savedTemplateOccurrence.title).toBe(updatedTitle);
});

test("Tasks-row and Workbench Task Focus completion return in place without opening an editor", async ({ page, request }, testInfo) => {
  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const listTask = await createTask(request, {
    next_action: `Keep list completion context ${suffix}`,
    title: `Tasks row direct completion ${suffix}`,
  }, "the Tasks-row Task");

  await page.goto("/tasks.html");
  const taskRow = page.locator("tr").filter({ hasText: listTask.title });
  await expect(taskRow).toBeVisible();
  await taskRow.locator('button[data-task-lifecycle-action="complete-task"]').click();
  await expect(page.locator("dialog[data-task-dialog][open]")).toHaveCount(0);
  await expect(taskRow).toBeHidden();
  const savedListTask = await readTask(request, listTask.task_id);
  expect(savedListTask.status).toBe("complete");
  expect(savedListTask.next_action).toBe(`Keep list completion context ${suffix}`);

  const workbenchTask = await createTask(request, {
    next_action: `Keep Workbench completion context ${suffix}`,
    title: `Workbench direct completion ${suffix}`,
  }, "the Workbench Task");
  await page.goto(`/workbench.html?taskId=${encodeURIComponent(workbenchTask.task_id)}`);
  await expect(page.locator("[data-workbench-host]")).toHaveAttribute("data-workbench-view-state", "task-focus");
  await page.getByRole("button", { name: "Complete task" }).click();
  await expect(page.locator("[data-workbench-host]")).toHaveAttribute("data-workbench-view-state", "focus-selection");
  await expect(page.locator("dialog[data-task-dialog][open]")).toHaveCount(0);
  const savedWorkbenchTask = await readTask(request, workbenchTask.task_id);
  expect(savedWorkbenchTask.status).toBe("complete");
  expect(savedWorkbenchTask.next_action).toBe(`Keep Workbench completion context ${suffix}`);
});
