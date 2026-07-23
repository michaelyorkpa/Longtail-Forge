import { expect, test } from "@playwright/test";

async function createRecord(request, path, data, label) {
  const response = await request.post(path, { data });
  expect(response.status(), `${label} should be created`).toBe(201);
  return response.json();
}

test("Tasks bulk Project assignment derives Business Client context and persists through the canonical route", async ({ page, request }, testInfo) => {
  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;
  const client = (await createRecord(request, "/api/clients", {
    name: `Task Bulk Client ${suffix}`,
  }, "the bulk Client")).client;
  const project = (await createRecord(request, `/api/clients/${encodeURIComponent(client.id)}/projects`, {
    name: `Task Bulk Project ${suffix}`,
  }, "the bulk Project")).project;
  const task = (await createRecord(request, "/api/tasks", {
    title: `Task Bulk Assignment ${suffix}`,
  }, "the bulk Task")).task;

  const response = await page.goto("/tasks.html");
  expect(response.status()).toBe(200);
  await page.getByRole("checkbox", { name: `Select ${task.title}`, exact: true }).check();

  const toolbar = page.locator("[data-task-bulk-toolbar]");
  await expect(toolbar).toHaveAttribute("open", "");
  const clientSelect = toolbar.locator("[data-task-bulk-client]");
  const projectSelect = toolbar.locator("[data-task-bulk-project]");
  await expect(clientSelect).toBeVisible();
  await clientSelect.selectOption(client.id);
  await expect(projectSelect.locator(`option[value="${project.id}"]`)).toHaveCount(1);
  await projectSelect.selectOption(project.id);
  await toolbar.locator("[data-task-bulk-apply]").click();

  await expect(page.locator(".view-list-shell-status[data-task-status]")).toContainText("Updated 1 task change");
  const savedResponse = await request.get(`/api/tasks/${encodeURIComponent(task.task_id)}`);
  expect(savedResponse.status()).toBe(200);
  const saved = (await savedResponse.json()).task;
  expect(saved.project_id).toBe(project.id);
  expect(saved.client_id).toBe(client.id);
});
