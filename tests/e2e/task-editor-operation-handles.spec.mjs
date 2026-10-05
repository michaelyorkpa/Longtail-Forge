import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

test("Task timer ticking survives reopen and cancelled block capture can be retried", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const suffix = randomUUID().slice(0, 8);
  const clientResponse = await api.post("/api/clients", { data: { name: `Handle client ${suffix}` } });
  expect(clientResponse.status(), await clientResponse.text()).toBe(201);
  const clientId = (await clientResponse.json()).client.id;
  const projectResponse = await api.post(`/api/clients/${clientId}/projects`, { data: { name: `Handle project ${suffix}` } });
  expect(projectResponse.status(), await projectResponse.text()).toBe(201);
  const projectId = (await projectResponse.json()).project.id;
  const created = await api.post("/api/tasks", { data: { title: `Operation handles ${suffix}`, client_id: clientId, project_id: projectId } });
  expect(created.status(), await created.text()).toBe(201);
  const taskId = (await created.json()).task.task_id;
  const taskPath = `/api/tasks/${taskId}`;
  const started = await api.put(`${taskPath}/timer`, { data: { accumulated_elapsed_seconds: 7, last_active_start_time: new Date().toISOString(), timer_status: "running" } });
  expect(started.status(), await started.text()).toBe(200);
  const before = await api.get(taskPath);
  expect(before.status()).toBe(200);
  const priorStatus = (await before.json()).task.status;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.tasksDialog))).toBe(true);
  /** @type {unknown[]} */ const writes = [];
  page.on("request", (request) => {
    if (request.method() === "PUT" && new URL(request.url()).pathname === taskPath) writes.push(request.postDataJSON());
  });
  const dialog = page.locator("dialog[data-task-dialog][open]");
  for (const pass of ["first", "reopened"]) {
    const opened = page.evaluate(async (id) => {
      const editor = globalThis.window.LongtailForge?.tasksDialog;
      if (!editor) throw new Error("Task editor unavailable");
      return editor.openTaskEditor({ mode: "edit", taskId: id });
    }, taskId);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-task-timer-status]")).toHaveText("Running.");
    const display = dialog.locator("[data-task-timer-display]");
    const initial = await display.textContent();
    await expect.poll(() => display.textContent()).not.toBe(initial);
    if (pass === "reopened") {
      const prompt = page.locator("dialog[data-capture-prompt][open]");
      await dialog.getByRole("button", { name: "Block task", exact: true }).click();
      await expect(prompt).toBeVisible();
      await prompt.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(prompt).toHaveCount(0);
      await expect(dialog.locator("[data-task-form-status]")).toHaveValue(priorStatus);
      expect(writes).toEqual([]);
      await dialog.getByRole("button", { name: "Block task", exact: true }).click();
      await prompt.getByRole("textbox", { name: "Blocked reason" }).fill("Waiting for reviewed input");
      const saving = page.waitForResponse((response) => new URL(response.url()).pathname === taskPath && response.request().method() === "PUT");
      await prompt.getByRole("button", { name: "Continue", exact: true }).click();
      const saved = await saving;
      expect(saved.status(), await saved.text()).toBe(200);
      await expect(dialog.locator("[data-task-timer-status]")).toHaveText("Paused.");
      await expect(dialog.locator("[data-task-form-status]")).toHaveValue("blocked");
      expect(writes).toHaveLength(1);
      const persisted = await api.get(taskPath);
      expect(persisted.status()).toBe(200);
      expect((await persisted.json()).task).toMatchObject({ status: "blocked", blocked_reason: "Waiting for reviewed input" });
      await page.screenshot({ path: testInfo.outputPath("operation-handles-blocked.png"), fullPage: true });
    }
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await opened;
    await expect(dialog).toHaveCount(0);
  }
});
