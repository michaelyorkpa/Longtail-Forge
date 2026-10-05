import { randomUUID } from "node:crypto";
import { test, expect } from "./support/isolated-workspace.mjs";

test("Tasks row workflows retain focus handoff and lifecycle resume payload", async ({ isolatedWorkspace }) => {
  const { page, api } = isolatedWorkspace;
  const title = `Workflow ${randomUUID()}`;
  const response = await api.post("/api/tasks", { data: { title, status: "blocked", blocked_reason: "Waiting for review" } });
  expect(response.status()).toBe(201);
  const taskId = (await response.json()).task.task_id;
  const path = `/api/tasks/${taskId}`;
  await page.goto("/tasks.html");
  const row = page.locator("tr").filter({ has: page.getByText(title, { exact: true }) });
  await row.locator(".task-row-workflow-actions summary").click();
  await page.locator(`[data-task-workflow-action="change-task-due-date"][data-task-id="${taskId}"]`).click();
  const dialog = page.locator("dialog[data-task-dialog][open]");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-task-due-date]")).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saving = page.waitForResponse((reply) => new URL(reply.url()).pathname === path && reply.request().method() === "PUT");
  await row.locator('[data-task-lifecycle-action="resume-task"]').click();
  const saved = await saving;
  expect(saved.status()).toBe(200);
  expect(saved.request().postDataJSON()).toEqual({ status: "in_progress", blocked_reason: "" });
  await expect(row.locator('[data-task-lifecycle-action="block-task"]')).toBeVisible();
  const persisted = await api.get(path);
  expect((await persisted.json()).task).toMatchObject({ status: "in_progress", blocked_reason: "" });
});

test("Tasks timer start pause resume use their real writes once and preserve resume capture", async ({ isolatedWorkspace }) => {
  const { page, api } = isolatedWorkspace;
  const suffix = randomUUID();
  const client = await api.post("/api/clients", { data: { name: `Workflow client ${suffix}` } });
  expect(client.status()).toBe(201);
  const clientId = (await client.json()).client.id;
  const project = await api.post(`/api/clients/${clientId}/projects`, { data: { name: `Workflow project ${suffix}` } });
  expect(project.status()).toBe(201);
  const projectId = (await project.json()).project.id;
  const title = `Workflow timer ${suffix}`;
  const created = await api.post("/api/tasks", { data: { title, project_id: projectId, client_id: clientId } });
  expect(created.status()).toBe(201);
  const taskId = (await created.json()).task.task_id;
  const path = `/api/tasks/${taskId}/timer`;
  /** @type {string[]} */ const writes = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === path && request.method() === "PUT") writes.push(request.postDataJSON().timer_status);
  });
  await page.goto("/tasks.html");
  const row = page.locator("tr").filter({ has: page.getByText(title, { exact: true }) });
  for (const [action, status, next] of [["start", "running", "pause"], ["pause", "paused", "resume"], ["resume", "running", "pause"]]) {
    await row.locator(".task-row-workflow-actions summary").click();
    const button = page.locator(`[data-task-workflow-action="${action}-task-timer"][data-task-id="${taskId}"]`);
    await expect(button).toBeEnabled();
    const writing = page.waitForResponse((reply) => new URL(reply.url()).pathname === path && reply.request().method() === "PUT");
    await button.click();
    const written = await writing;
    expect(written.status()).toBe(200);
    expect(written.request().postDataJSON().timer_status).toBe(status);
    if (action === "pause") {
      const capture = page.getByRole("dialog", { name: "Add resume note?" });
      await expect(capture).toBeVisible();
      await capture.getByRole("button", { name: "No", exact: true }).click();
      await expect(capture).not.toBeVisible();
    }
    await expect(page.locator(`[data-task-workflow-action="${next}-task-timer"][data-task-id="${taskId}"]`)).toHaveCount(1);
  }
  expect(writes).toEqual(["running", "paused", "running"]);
});
