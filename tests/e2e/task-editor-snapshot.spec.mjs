import { randomUUID } from "node:crypto";
import { expect, test } from "./support/isolated-workspace.mjs";

test("Task snapshots distinguish clean, occurrence-only and saved template edits", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  const dueDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.window.LongtailForge?.tasksDialog))).toBe(true);
  const dialog = page.locator("dialog[data-task-dialog][open]");
  const scopePrompt = page.getByRole("dialog", { name: "Update recurring task", exact: true });

  for (const scenario of ["clean", "occurrence", "template"]) {
    const title = `Snapshot ${scenario} ${randomUUID().slice(0, 8)}`;
    const created = await api.post("/api/tasks", { data: { title, due_date: dueDate, recurrence: { enabled: true, endDate, frequency: "DAILY", interval: 1 } } });
    expect(created.status(), await created.text()).toBe(201);
    const task = (await created.json()).task;
    expect(task.recurrence_template_id).toBeTruthy();
    const taskPath = `/api/tasks/${task.task_id}`;
    /** @type {string[]} */ const writes = [];
    /** @param {import("@playwright/test").Request} request */
    const recordWrite = (request) => {
      const path = new URL(request.url()).pathname;
      if (path === taskPath && request.method() === "PUT") writes.push("save");
      if (path === `${taskPath}/complete` && request.method() === "POST") writes.push("complete");
    };
    page.on("request", recordWrite);
    const opened = page.evaluate(async (id) => {
      const editor = globalThis.window.LongtailForge?.tasksDialog;
      if (!editor) throw new Error("Task editor unavailable");
      return editor.openTaskEditor({ mode: "edit", taskId: id });
    }, task.task_id);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-task-title]")).toHaveValue(title);
    if (scenario === "occurrence") {
      await dialog.locator("[data-task-next-action]").fill("Preserve this occurrence's next action");
    }
    if (scenario === "template") {
      await dialog.locator("[data-task-title]").fill(`${title} revised`);
      await dialog.getByRole("button", { name: "Save task", exact: true }).click();
      await expect(scopePrompt).toBeVisible();
      const saving = page.waitForResponse((response) => new URL(response.url()).pathname === taskPath && response.request().method() === "PUT");
      await scopePrompt.getByRole("button", { name: "Only This Task", exact: true }).click();
      const saved = await saving;
      expect(saved.status(), await saved.text()).toBe(200);
      // The edit path refreshes the host list; the "Continue editing" message
      // belongs only to creation. A rendered refreshed row follows the snapshot reset.
      const refreshedRow = page.locator('tr[data-task-status="open"]').filter({ has: page.locator(`input[type="checkbox"][value="${task.task_id}"]`) });
      await expect(refreshedRow).toContainText(`${title} revised`);
      const afterSave = await api.get(taskPath);
      expect(afterSave.status()).toBe(200);
      const savedBeforeCompletion = (await afterSave.json()).task;
      expect(savedBeforeCompletion).toMatchObject({ status: "open", title: `${title} revised` });
      await testInfo.attach("edit-save-status-observation", {
        body: JSON.stringify({ persistedStatus: savedBeforeCompletion.status, displayedStatus: await page.locator('[role="status"][data-task-status]').textContent() }),
        contentType: "application/json",
      });
      await expect(dialog).toBeVisible();
      expect(writes).toEqual(["save"]);
      await page.screenshot({ path: testInfo.outputPath("snapshot-after-save.png"), fullPage: true });
    }
    const completing = page.waitForResponse((response) => new URL(response.url()).pathname === `${taskPath}/complete` && response.request().method() === "POST");
    await dialog.getByRole("button", { name: "Complete task", exact: true }).click();
    const completed = await completing;
    expect(completed.status(), await completed.text()).toBe(200);
    await opened;
    await expect(dialog).toHaveCount(0);
    await expect(scopePrompt).toHaveCount(0);
    expect(writes).toEqual(scenario === "clean" ? ["complete"] : ["save", "complete"]);
    const persisted = await api.get(taskPath);
    expect(persisted.status()).toBe(200);
    const savedTask = (await persisted.json()).task;
    expect(savedTask.status).toBe("complete");
    expect(savedTask.title).toBe(scenario === "template" ? `${title} revised` : title);
    if (scenario === "occurrence") expect(savedTask.next_action).toBe("Preserve this occurrence's next action");
    page.off("request", recordWrite);
  }
});
