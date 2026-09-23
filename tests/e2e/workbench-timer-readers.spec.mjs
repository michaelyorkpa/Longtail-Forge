import { test, expect } from "./support/isolated-workspace.mjs";

test("Workbench sorts task timers and excludes only the focused task from the lower panel", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const client = await api.post("/api/clients", { data: { name: "Timer reader client" } });
  expect(client.status(), await client.text()).toBe(201);
  const clientId = (await client.json()).client.id;
  const project = await api.post(`/api/clients/${clientId}/projects`, { data: { name: "Timer reader project" } });
  expect(project.status(), await project.text()).toBe(201);
  const projectId = (await project.json()).project.id;
  /** @type {string[]} */ const ids = [];
  for (const [title, status] of [["Paused reading task", "paused"], ["Running reading task", "running"]]) {
    const task = await api.post("/api/tasks", { data: { title, client_id: clientId, project_id: projectId } });
    expect(task.status(), await task.text()).toBe(201);
    const id = (await task.json()).task.task_id; ids.push(id);
    const timer = await api.put(`/api/tasks/${id}/timer`, { data: { timer_status: status, accumulated_elapsed_seconds: 12, last_active_start_time: new Date().toISOString() } });
    expect(timer.status(), await timer.text()).toBe(200);
  }
  /** @type {string[]} */ const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/workbench.html");
  const cards = page.locator(".workbench-timer-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAttribute("data-workbench-timer-key", `task:${ids[1]}`);
  await expect(cards.nth(0)).toContainText("Running reading task");
  await expect(cards.nth(1)).toHaveAttribute("data-workbench-timer-key", `task:${ids[0]}`);
  await expect(cards.nth(1)).toContainText("Paused reading task");
  await page.goto(`/workbench.html?taskId=${ids[1]}`);
  await expect(page.locator("[data-workbench-task-focus-summary]")).toContainText("Running reading task");
  await expect(page.locator("[data-workbench-task-focus-timer-status]")).toContainText("Running");
  await expect(cards).toHaveCount(1);
  await expect(cards).toHaveAttribute("data-workbench-timer-key", `task:${ids[0]}`);
  await expect(cards).toContainText("Paused reading task");
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("timer-selection.png"), fullPage: true });
});
