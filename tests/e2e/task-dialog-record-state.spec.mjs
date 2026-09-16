import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

test("Task detail survives base timer updates and checklist reorder persists the intended rows", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const suffix = randomUUID().slice(0, 8);
  const client = await api.post("/api/clients", { data: { name: `Record client ${suffix}` } });
  expect(client.status(), await client.text()).toBe(201);
  const clientId = (await client.json()).client.id;
  const project = await api.post(`/api/clients/${clientId}/projects`, { data: { name: `Record project ${suffix}` } });
  expect(project.status(), await project.text()).toBe(201);
  const projectId = (await project.json()).project.id;
  const created = await api.post("/api/tasks", { data: { title: `Record state ${suffix}`, client_id: clientId, project_id: projectId } });
  expect(created.status(), await created.text()).toBe(201);
  const task = (await created.json()).task;
  const path = `/api/tasks/${task.task_id}`;
  /** @type {string[]} */ const ids = [];
  for (const label of ["First", "Second"]) {
    const result = await api.post(`${path}/checklist`, { data: { label } });
    expect(result.status(), await result.text()).toBe(201);
    ids.push((await result.json()).item.task_checklist_item_id);
  }
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.tasksDialog))).toBe(true);
  const opened = page.evaluate(async (id) => {
    const editor = globalThis.window.LongtailForge?.tasksDialog;
    if (!editor) throw new Error("Task editor unavailable");
    return editor.openTaskEditor({ mode: "edit", taskId: id });
  }, task.task_id);
  const dialog = page.locator("dialog[data-task-dialog][open]");
  await expect(dialog).toBeVisible();
  const rows = dialog.locator("[data-task-checklist-item]");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toBeVisible();
  const started = page.waitForResponse((response) => new URL(response.url()).pathname === `${path}/timer` && response.request().method() === "PUT");
  await dialog.locator("[data-task-timer-start]").click();
  const timer = await started;
  expect(timer.status(), await timer.text()).toBe(200);
  expect((await timer.json()).task).not.toHaveProperty("checklistItems");
  await expect(dialog.locator("[data-task-timer-status]")).toHaveText("Running.");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toBeVisible();
  await expect(dialog.locator("[data-task-form-status]")).toHaveValue("in_progress");
  const reordering = page.waitForResponse((response) => new URL(response.url()).pathname === `${path}/checklist/reorder` && response.request().method() === "POST");
  await dialog.locator(`[data-task-checklist-item="${ids[1]}"] [data-task-checklist-action="up"]`).click();
  const reordered = await reordering;
  expect(reordered.status(), await reordered.text()).toBe(200);
  expect(reordered.request().postDataJSON()).toEqual({ item_ids: [ids[1], ids[0]] });
  await expect(rows.first()).toHaveAttribute("data-task-checklist-item", ids[1]);
  const persisted = await api.get(path);
  expect(persisted.status()).toBe(200);
  expect((await persisted.json()).task.checklistItems.map((/** @type {{task_checklist_item_id:string}} */ item) => item.task_checklist_item_id)).toEqual([ids[1], ids[0]]);
  await page.screenshot({ path: testInfo.outputPath("task-record-state.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await opened).toBe("cancel");
  const reset = await api.delete(`${path}/timer`);
  expect(reset.status(), await reset.text()).toBe(200);
});
